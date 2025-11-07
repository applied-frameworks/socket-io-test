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

**Create development environment:**
```bash
eb create socket-io-canvas-dev \
  --instance-type t3.micro \
  --single
```

The `--single` flag creates a single-instance environment (no load balancer, saves ~$16/month). For production environments with load balancing, omit this flag.

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
- `environment_name: socket-io-canvas-dev`
- `region: us-east-2`

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
