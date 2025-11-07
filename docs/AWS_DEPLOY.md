# AWS Deployment Guide - Elastic Beanstalk

This guide covers deploying the Socket.IO collaborative canvas application to AWS using Elastic Beanstalk with CLI commands and automated GitHub Actions deployment.

## Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured:
   ```bash
   aws configure
   # Enter: AWS Access Key ID, Secret Access Key, Region (e.g., us-east-2)
   ```
3. **EB CLI** installed:
   ```bash
   pip install awsebcli
   ```
4. **GitHub repository** with admin access
5. **Node.js 22.x** installed locally

## Overview

**Stack:**
- Elastic Beanstalk (Node.js 22) + RDS PostgreSQL + GitHub Actions CI/CD
- WebSocket support via Nginx proxy configuration
- Free tier eligible (~$5-20/month after free tier)

## Quick Start (CLI)

### 1. Create IAM User for GitHub Actions

```bash
# Create IAM user
aws iam create-user --user-name github-actions-deployer

# Attach required policies
aws iam attach-user-policy \
  --user-name github-actions-deployer \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-AWSElasticBeanstalk

aws iam attach-user-policy \
  --user-name github-actions-deployer \
  --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess

# Create access key (save these for GitHub Secrets)
aws iam create-access-key --user-name github-actions-deployer
```

**Save the output:** `AccessKeyId` and `SecretAccessKey` for GitHub Actions setup.

### 2. Create RDS PostgreSQL Database

**Generate a secure password:**
```bash
export DB_PASSWORD=$(openssl rand -base64 32)
echo "Database password: $DB_PASSWORD"  # Save this!
```

**Create database:**
```bash
aws rds create-db-instance \
  --db-instance-identifier socket-io-canvas-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 17.4 \
  --master-username postgres \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 \
  --db-name socketio_canvas \
  --backup-retention-period 7 \
  --no-publicly-accessible \
  --region us-east-2
```

**Wait for database to be available (~5 minutes):**
```bash
aws rds wait db-instance-available --db-instance-identifier socket-io-canvas-db
```

**Get database endpoint:**
```bash
aws rds describe-db-instances \
  --db-instance-identifier socket-io-canvas-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text
```

**Skip RDS (SQLite option):** Set `DATABASE_URL="file:./dev.db"` in environment variables (testing only).

### 3. Create Elastic Beanstalk Application

**Initialize EB CLI in your project directory:**
```bash
cd /path/to/socket-io-test

# Initialize with Node.js 22 platform
eb init socket-io-canvas \
  --platform node.js \
  --region us-east-2
```

**Choose environment type:**

**Option A: SingleInstance (Development/Testing)**
```bash
eb create socket-io-canvas-dev \
  --instance-type t3.micro \
  --single
```
- **Pros:** Lower cost (~$5/month), simpler setup
- **Cons:** No load balancer, no auto-scaling, no HTTPS at load balancer, single point of failure
- **Use for:** Development, testing, personal projects

**Option B: LoadBalanced (Production)**
```bash
eb create socket-io-canvas-prod \
  --instance-type t3.micro \
  --elb-type application
```
- **Pros:** Auto-scaling, high availability, HTTPS/SSL support, sticky sessions for WebSockets
- **Cons:** Higher cost (~$30-50/month with load balancer)
- **Use for:** Production, staging, public-facing applications

**IMPORTANT:** Environment type cannot be changed after creation. To switch from SingleInstance to LoadBalanced, you must create a new environment.

### 4. Configure Environment Variables

**Generate JWT secret:**
```bash
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo "JWT_SECRET=$JWT_SECRET"  # Save this!
```

**Get RDS endpoint and build DATABASE_URL:**
```bash
export DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier socket-io-canvas-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

export DATABASE_URL="postgresql://postgres:$DB_PASSWORD@$DB_ENDPOINT:5432/socketio_canvas"
echo "DATABASE_URL=$DATABASE_URL"
```

**Set environment variables:**
```bash
eb setenv \
  NODE_ENV=development \
  JWT_SECRET="$JWT_SECRET" \
  DATABASE_URL="$DATABASE_URL" \
  CLIENT_URL="http://localhost:8000" \
  NPM_USE_PRODUCTION=false
```

**Important:** `NPM_USE_PRODUCTION=false` ensures Prisma dependencies are installed. For production, use `NODE_ENV=production` and update `CLIENT_URL` to your production frontend URL.

### 5. Configure Security Groups

**Get security group IDs:**
```bash
# Get EB security group
export EB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*elasticbeanstalk*" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Get RDS security group
export RDS_SG=$(aws rds describe-db-instances \
  --db-instance-identifier socket-io-canvas-db \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)
```

**Allow EB to connect to RDS:**
```bash
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG \
  --protocol tcp \
  --port 5432 \
  --source-group $EB_SG
```

## HTTPS and Custom Domain Setup (LoadBalanced Only)

**Prerequisites:**
- LoadBalanced environment (Application Load Balancer)
- Custom domain with DNS access
- AWS Certificate Manager permissions

### 1. Request SSL Certificate

**Using AWS Certificate Manager (ACM):**
```bash
# Request certificate for your domain
aws acm request-certificate \
  --domain-name your-domain.com \
  --subject-alternative-names "*.your-domain.com" \
  --validation-method DNS \
  --region us-east-2

# Get certificate ARN from output
export CERT_ARN="arn:aws:acm:us-east-2:ACCOUNT_ID:certificate/CERT_ID"
```

**Important:** Certificate must be in the same region as your Elastic Beanstalk environment.

### 2. Validate Certificate via DNS

```bash
# Get DNS validation records
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-2 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

**Add the CNAME record to your DNS provider:**
- Record Type: CNAME
- Name: `_validation-string.your-domain.com`
- Value: `_validation-target.acm-validations.aws.`

**Wait for validation (1-30 minutes):**
```bash
# Check certificate status
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-2 \
  --query 'Certificate.Status'

# Should return: "ISSUED"
```

### 3. Configure HTTPS Listener

**Add HTTPS listener to your LoadBalanced environment:**
```bash
aws elasticbeanstalk update-environment \
  --environment-name socket-io-canvas-prod \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:elbv2:listener:443,OptionName=Protocol,Value=HTTPS \
    Namespace=aws:elbv2:listener:443,OptionName=SSLCertificateArns,Value=$CERT_ARN \
    Namespace=aws:elbv2:listener:443,OptionName=DefaultProcess,Value=default
```

**Or create a config file** `.ebextensions/https-listener.config`:
```yaml
option_settings:
  # HTTPS Listener Configuration
  aws:elbv2:listener:443:
    Protocol: HTTPS
    SSLCertificateArns: arn:aws:acm:us-east-2:ACCOUNT_ID:certificate/CERT_ID
    DefaultProcess: default

  # Keep HTTP listener for redirects
  aws:elbv2:listener:80:
    Protocol: HTTP
    DefaultProcess: default
```

**Then deploy:**
```bash
eb deploy
```

### 4. Configure DNS CNAME Record

**Get your load balancer URL:**
```bash
eb status | grep CNAME
# Output: CNAME: socket-io-canvas-prod.elasticbeanstalk.com
```

**Add CNAME record to your DNS provider:**
- Record Type: CNAME
- Name: `app` (or subdomain of choice)
- Value: `socket-io-canvas-prod.elasticbeanstalk.com`
- TTL: 300 (5 minutes)

**Example:** `app.your-domain.com` → `socket-io-canvas-prod.elasticbeanstalk.com`

### 5. Update Environment Variables

**Update CLIENT_URL to use HTTPS:**
```bash
eb setenv CLIENT_URL="https://app.your-domain.com"
```

### 6. Verify HTTPS Configuration

**Test the setup:**
```bash
# Check HTTP (should work)
curl -I http://app.your-domain.com

# Check HTTPS (should work with valid SSL)
curl -I https://app.your-domain.com

# Verify SSL certificate
openssl s_client -connect app.your-domain.com:443 -servername app.your-domain.com
```

### Troubleshooting HTTPS

**Certificate mismatch error:**
- Ensure certificate domain matches your CNAME record
- Certificate must be in `ISSUED` status
- DNS must be fully propagated

**Connection timeout:**
- Verify load balancer security group allows inbound traffic on port 443
- Check HTTPS listener is configured correctly:
  ```bash
  aws elasticbeanstalk describe-configuration-settings \
    --environment-name socket-io-canvas-prod \
    --application-name socket-io-canvas \
    --region us-east-2 \
    --query "ConfigurationSettings[0].OptionSettings[?Namespace=='aws:elbv2:listener:443']"
  ```

**Mixed content warnings:**
- Ensure all resources load over HTTPS
- Update `CLIENT_URL` to use HTTPS
- Check browser console for insecure resource warnings

## GitHub Actions Setup

**Add secrets using GitHub CLI:**
```bash
# Install GitHub CLI if needed: brew install gh

# Authenticate
gh auth login

# Add secrets (from IAM user creation in Step 1)
gh secret set AWS_ACCESS_KEY_ID
gh secret set AWS_SECRET_ACCESS_KEY
```

**Or add manually:** Repository → Settings → Secrets and variables → Actions

**Verify workflow configuration** in `.github/workflows/deploy-aws.yml` matches your setup:
- `application_name: socket-io-canvas`
- `environment_name: socket-io-canvas-prod` (or your environment name)
- `region: us-east-2`

**Note:** Update `environment_name` in the workflow to match your target environment (dev, staging, or prod).

**Deploy:**
```bash
git add .
git commit -m "Deploy to AWS"
git push origin main  # Triggers automatic deployment
```

Deployment takes ~5-10 minutes. Monitor at: `gh run watch`

## EB CLI Commands

```bash
# Deploy manually
eb deploy

# View logs
eb logs --stream

# SSH into instance
eb ssh

# Open app in browser
eb open

# Check status
eb status

# Scale instances
eb scale 2

# Terminate environment
eb terminate socket-io-canvas-dev
```

## Post-Deployment

**Get application URL:**
```bash
eb status | grep CNAME
```

**Test health endpoint:**
```bash
curl $(eb status | grep CNAME | awk '{print $2}')/health
# Expected: {"status":"ok","timestamp":"..."}
```

**Seed database (optional):**
```bash
eb ssh
cd /var/app/current
npx prisma db seed
exit
```

## Monitoring

**View logs:**
```bash
# Real-time streaming
eb logs --stream

# All logs
eb logs --all
```

**View CloudWatch logs:**
```bash
# List log groups
aws logs describe-log-groups --log-group-name-prefix /aws/elasticbeanstalk

# Tail logs
aws logs tail /aws/elasticbeanstalk/socket-io-canvas-dev/var/log/web.stdout.log --follow
```

**Check environment health:**
```bash
eb health
eb status
```

## Troubleshooting

**Check logs:**
```bash
eb logs --all
gh run view  # GitHub Actions logs
```

**Common issues:**

1. **Database connection fails:**
   ```bash
   # Test from EB instance
   eb ssh
   telnet $DB_ENDPOINT 5432

   # Verify security group allows connection
   aws ec2 describe-security-groups --group-ids $RDS_SG
   ```

2. **Application won't start:**
   - Check `DATABASE_URL` is set: `eb printenv`
   - Ensure `NPM_USE_PRODUCTION=false` is set
   - Verify app listens on `process.env.PORT`

3. **WebSocket connections fail:**
   - Verify `.platform/nginx/conf.d/websocket_upgrade.conf` exists
   - Check sticky sessions enabled (if using load balancer)

**Scale resources:**
```bash
# Upgrade instance type
eb scale --instance-type t3.small

# Add instances
eb scale 3
```

## Cost Management

**Monitor spending:**
```bash
# View current month costs
aws ce get-cost-and-usage \
  --time-period Start=$(date -u +%Y-%m-01),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics BlendedCost

# Set billing alarm
aws cloudwatch put-metric-alarm \
  --alarm-name billing-alarm \
  --alarm-description "Alert when charges exceed $20" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --threshold 20 \
  --comparison-operator GreaterThanThreshold
```

**Estimated costs:**
- Free tier: $0 (first 12 months with 1x t3.micro + 1x db.t3.micro)
- Single instance: ~$5-10/month (no load balancer)
- Production (load balanced): ~$50-100/month

**Delete resources when done:**
```bash
# Delete development environment
eb terminate socket-io-canvas-dev

# Delete RDS database
aws rds delete-db-instance \
  --db-instance-identifier socket-io-canvas-db \
  --skip-final-snapshot

# Delete IAM user (get access key ID first)
aws iam list-access-keys --user-name github-actions-deployer
aws iam delete-access-key --user-name github-actions-deployer --access-key-id AKIA...
aws iam detach-user-policy --user-name github-actions-deployer --policy-arn arn:aws:iam::aws:policy/AdministratorAccess-AWSElasticBeanstalk
aws iam detach-user-policy --user-name github-actions-deployer --policy-arn arn:aws:iam::aws:policy/AmazonS3FullAccess
aws iam delete-user --user-name github-actions-deployer
```

## Resources

- [AWS Elastic Beanstalk Docs](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-nodejs.html)
- [EB CLI Reference](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html)
- [Socket.IO on AWS](https://socket.io/docs/v4/using-multiple-nodes/)
