# AWS Deployment Guide - Elastic Beanstalk

This guide covers deploying the Socket.IO collaborative canvas application to AWS using Elastic Beanstalk with CLI commands and automated GitHub Actions deployment.

## Important: Build Artifacts

**DO NOT commit `client/dist/` files to git.** Build artifacts should never be in version control.

The GitHub Actions workflow (`.github/workflows/deploy-aws.yml`) handles this correctly by:
1. Building the frontend during deployment (`npm run client:build`)
2. Including `client/dist/` in the deployment zip
3. Excluding `client/src/` (source files) from the deployment zip
4. Keeping `dist/` in `.gitignore` (never committed to git)

This ensures built files are included in deployments but excluded from version control.

## Deploying Additional Environments

This section provides a complete guide for deploying additional environments (staging, production, etc.) following the patterns established in this project.

### Multi-Environment Strategy

The project supports multiple environments with:
- **Branch-based deployment**: Each git branch deploys to its corresponding environment
- **Environment isolation**: Separate RDS databases, SSL certificates, and configuration per environment
- **Automated CI/CD**: GitHub Actions automatically deploys when you push to tracked branches
- **Consistent naming**: All resources include the environment name for easy identification

**Current Setup:**
- `main` branch → `socket-io-canvas-dev` environment → `https://labs-dev.appliedframeworks.com`
- `staging` branch → `socket-io-canvas-staging` environment → `https://staging-labs.appliedframeworks.com`

### Complete Deployment Checklist

Use this checklist when deploying a new environment (e.g., production):

#### 1. Generate Secrets

```bash
# Generate unique JWT secret for the environment
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo "JWT_SECRET=$JWT_SECRET"  # SAVE THIS!

# Generate secure database password (hex encoding - no special chars)
export DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
echo "DB_PASSWORD=$DB_PASSWORD"  # SAVE THIS!
```

**IMPORTANT**: Save these values immediately. You'll need them for environment configuration.

#### 2. Create Git Branch

```bash
# Create and push new branch from main
git checkout main
git pull origin main
git checkout -b production  # Or your environment name
git push -u origin production
```

#### 3. Create RDS PostgreSQL Database

```bash
# Replace 'production' with your environment name
aws rds create-db-instance \
  --db-instance-identifier socket-io-canvas-production-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 17.4 \
  --master-username postgres \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 \
  --db-name socketio_canvas_production \
  --backup-retention-period 7 \
  --no-publicly-accessible \
  --region us-east-2

# Wait for database to be available (~5 minutes)
aws rds wait db-instance-available --db-instance-identifier socket-io-canvas-production-db

# Get database endpoint
export DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier socket-io-canvas-production-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

# Build DATABASE_URL
export DATABASE_URL="postgresql://postgres:$DB_PASSWORD@$DB_ENDPOINT:5432/socketio_canvas_production"
echo "DATABASE_URL=$DATABASE_URL"  # SAVE THIS!
```

#### 4. Request SSL Certificate

```bash
# Request certificate for your custom domain
aws acm request-certificate \
  --domain-name your-production-domain.com \
  --subject-alternative-names "*.your-production-domain.com" \
  --validation-method DNS \
  --region us-east-2

# Get certificate ARN from output
export CERT_ARN="arn:aws:acm:us-east-2:ACCOUNT_ID:certificate/CERT_ID"

# Get DNS validation records
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-2 \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

**Action Required**: Add the CNAME record to your DNS provider for certificate validation.

**Wait for certificate validation:**
```bash
# Check status (should show "ISSUED" when ready)
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --region us-east-2 \
  --query 'Certificate.Status' \
  --output text
```

#### 5. Create Elastic Beanstalk Environment

```bash
export PATH="/Users/YOUR_USERNAME/.ebcli-virtual-env/executables:$PATH"

# Create LoadBalanced environment (recommended for production)
eb create socket-io-canvas-production \
  --instance-type t3.micro \
  --elb-type application
```

**Note**: Initial deployment may fail - this is expected. Environment variables will be configured next.

#### 6. Update EB CLI Configuration

```bash
# Edit .elasticbeanstalk/config.yml
```

Add your branch to `branch-defaults`:
```yaml
branch-defaults:
  main:
    environment: socket-io-canvas-dev
  staging:
    environment: socket-io-canvas-staging
  production:  # Add your new environment
    environment: socket-io-canvas-production
```

**Commit this change:**
```bash
git add .elasticbeanstalk/config.yml
git commit -m "Add production environment to EB CLI config"
git push origin production
```

#### 7. Configure DNS

Add CNAME record in Route53 (or your DNS provider):

```bash
# Get your load balancer URL
eb status | grep CNAME
# Output: CNAME: socket-io-canvas-production.elasticbeanstalk.com
```

**DNS Configuration:**
- Record Type: `CNAME`
- Name: `your-subdomain` (e.g., `app` or `prod`)
- Value: `socket-io-canvas-production.elasticbeanstalk.com`
- TTL: `300` (5 minutes)

**Verify DNS propagation:**
```bash
dig +short your-subdomain.your-domain.com
# Should return: socket-io-canvas-production.elasticbeanstalk.com
```

#### 8. Configure Security Groups

```bash
# Get EB security group
export EB_SG=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*socket-io-canvas-production*" \
  --query 'SecurityGroups[0].GroupId' \
  --output text)

# Get RDS security group
export RDS_SG=$(aws rds describe-db-instances \
  --db-instance-identifier socket-io-canvas-production-db \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

# Allow EB to connect to RDS on port 5432
aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG \
  --protocol tcp \
  --port 5432 \
  --source-group $EB_SG
```

#### 9. Configure Environment Variables

```bash
export CLIENT_URL="https://your-subdomain.your-domain.com"

eb use socket-io-canvas-production
eb setenv \
  NODE_ENV=production \
  JWT_SECRET="$JWT_SECRET" \
  DATABASE_URL="$DATABASE_URL" \
  CLIENT_URL="$CLIENT_URL" \
  NPM_USE_PRODUCTION=false
```

**IMPORTANT**: `NPM_USE_PRODUCTION=false` ensures Prisma dependencies are installed.

#### 10. Configure HTTPS Listener

```bash
# Wait for environment to be Ready
aws elasticbeanstalk describe-environments \
  --environment-names socket-io-canvas-production \
  --region us-east-2 \
  --query 'Environments[0].Status' \
  --output text

# Configure HTTPS listener with SSL certificate
aws elasticbeanstalk update-environment \
  --environment-name socket-io-canvas-production \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:elbv2:listener:443,OptionName=Protocol,Value=HTTPS \
    Namespace=aws:elbv2:listener:443,OptionName=SSLCertificateArns,Value=$CERT_ARN \
    Namespace=aws:elbv2:listener:443,OptionName=DefaultProcess,Value=default
```

#### 11. Update GitHub Actions Workflow

Edit `.github/workflows/deploy-aws.yml`:

```yaml
- name: Set environment based on branch
  id: set-env
  run: |
    if [ "${{ github.ref }}" == "refs/heads/main" ]; then
      echo "env_name=socket-io-canvas-dev" >> $GITHUB_OUTPUT
      echo "env_url=https://labs-dev.appliedframeworks.com" >> $GITHUB_OUTPUT
    elif [ "${{ github.ref }}" == "refs/heads/staging" ]; then
      echo "env_name=socket-io-canvas-staging" >> $GITHUB_OUTPUT
      echo "env_url=https://staging-labs.appliedframeworks.com" >> $GITHUB_OUTPUT
    elif [ "${{ github.ref }}" == "refs/heads/production" ]; then
      echo "env_name=socket-io-canvas-production" >> $GITHUB_OUTPUT
      echo "env_url=https://your-subdomain.your-domain.com" >> $GITHUB_OUTPUT
    fi
```

**Commit and push:**
```bash
git add .github/workflows/deploy-aws.yml
git commit -m "Add production environment to GitHub Actions workflow"
git push origin production
```

This triggers automatic deployment via GitHub Actions.

#### 12. Verify Deployment

```bash
# Check deployment status
gh run list --branch production --limit 1

# Verify environment health
aws elasticbeanstalk describe-environments \
  --environment-names socket-io-canvas-production \
  --region us-east-2 \
  --query 'Environments[0].[Status,Health,HealthStatus]' \
  --output text

# Test backend API
curl -I https://your-subdomain.your-domain.com/health

# Test frontend
curl -I https://your-subdomain.your-domain.com/
```

**Expected Results:**
- Environment Status: `Ready`
- Environment Health: `Green`
- Backend API: `HTTP/2 200`
- Frontend: `HTTP/2 200` with `content-type: text/html`

### Naming Conventions

Follow these patterns for consistency:

| Resource Type | Pattern | Examples |
|--------------|---------|----------|
| Git Branch | `{env}` | `main`, `staging`, `production` |
| EB Environment | `socket-io-canvas-{env}` | `socket-io-canvas-dev`, `socket-io-canvas-staging` |
| RDS Instance | `socket-io-canvas-{env}-db` | `socket-io-canvas-production-db` |
| Database Name | `socketio_canvas_{env}` | `socketio_canvas_production` |
| Custom Domain | `{env}-labs.appliedframeworks.com` OR `{subdomain}.your-domain.com` | `staging-labs.appliedframeworks.com`, `app.your-domain.com` |

### Environment-Specific Configuration

**NODE_ENV Values:**
- Development: `development` or `staging`
- Production: `production`

**CRITICAL**: Ensure `server.js` serves static files for your NODE_ENV value:

```javascript
// server.js line 70
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  const clientBuildPath = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientBuildPath));
  // ...
}
```

**If adding a new NODE_ENV value**, update this condition to include it.

### Common Pitfalls and Solutions

#### 1. Build Artifacts in Git
**Problem**: Accidentally committing `client/dist/` files to version control.

**Solution**:
- **NEVER** commit build artifacts to git
- Ensure `dist/` is in `.gitignore`
- GitHub Actions builds the client and includes it in deployment zip
- Deployment zip includes `client/dist/` but excludes `client/src/*`

**If you committed dist files by mistake:**
```bash
git reset --hard HEAD~1  # Undo last commit
git push --force origin your-branch  # Force push to remove from remote
```

#### 2. Frontend Returns 404
**Problem**: Backend API works but frontend returns 404 errors.

**Root Cause**: `server.js` doesn't serve static files for your NODE_ENV value.

**Solution**: Update `server.js` line 70 to include your NODE_ENV:
```javascript
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || process.env.NODE_ENV === 'your-env') {
```

#### 3. RDS Connection Fails
**Problem**: Application can't connect to RDS database.

**Solution**: Verify security group configuration:
```bash
# Check if EB security group is authorized to access RDS
aws ec2 describe-security-groups --group-ids $RDS_SG \
  --query 'SecurityGroups[0].IpPermissions'
```

Should show ingress rule from EB security group on port 5432.

#### 4. Invalid Database Password
**Problem**: RDS creation fails with "not a valid password" error.

**Cause**: Password contains special characters (`/`, `@`, `"`, ` `, `+`, `=`)

**Solution**: Use hex encoding instead of base64:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

#### 5. Certificate Validation Timeout
**Problem**: SSL certificate stuck in "Pending Validation" status.

**Solution**: Verify DNS CNAME record is correctly configured:
```bash
dig +short _validation-string.your-domain.com CNAME
```

Should return the ACM validation target.

#### 6. Environment Not Ready for HTTPS Configuration
**Problem**: HTTPS listener configuration fails with "invalid state" error.

**Solution**: Wait for environment to reach "Ready" status:
```bash
aws elasticbeanstalk describe-environments \
  --environment-names socket-io-canvas-{env} \
  --region us-east-2 \
  --query 'Environments[0].Status' \
  --output text
```

Only proceed when status is `Ready`.

### Deployment Workflow Summary

1. Generate secrets (JWT_SECRET, DB_PASSWORD)
2. Create git branch
3. Create RDS database (parallel)
4. Request SSL certificate (parallel)
5. Create EB environment (parallel)
6. Update EB CLI config
7. Configure DNS
8. Configure security groups
9. Set environment variables
10. Configure HTTPS listener
11. Update GitHub Actions workflow
12. Verify deployment

**Parallel steps** (3-5) can run simultaneously to save time.

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
