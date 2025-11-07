# AWS Deployment Guide - Elastic Beanstalk

This guide covers deploying the Socket.IO collaborative canvas application to AWS using Elastic Beanstalk with automated GitHub Actions deployment.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [AWS Setup](#aws-setup)
  - [Create RDS PostgreSQL Database](#create-rds-postgresql-database)
  - [Create Elastic Beanstalk Application](#create-elastic-beanstalk-application)
  - [Configure Environment Variables](#configure-environment-variables)
- [GitHub Actions Setup](#github-actions-setup)
- [Manual Deployment (EB CLI)](#manual-deployment-eb-cli)
- [Post-Deployment](#post-deployment)
- [Monitoring and Logs](#monitoring-and-logs)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)

## Overview

**Deployment Architecture:**
- **Compute**: AWS Elastic Beanstalk (Node.js 22 platform)
- **Database**: AWS RDS PostgreSQL (or SQLite for testing)
- **WebSocket**: Nginx proxy with WebSocket upgrade support
- **CI/CD**: GitHub Actions automated deployment
- **ORM**: Prisma with automatic migrations

**Why Elastic Beanstalk?**
- PaaS similar to Heroku - easy setup and management
- Built-in load balancing and auto-scaling
- Excellent WebSocket/Socket.IO support
- Integrated monitoring with CloudWatch
- Free tier eligible for small apps

## Prerequisites

1. **AWS Account** with billing enabled
2. **AWS CLI** installed and configured
3. **EB CLI** (optional, for manual deployments)
4. **GitHub repository** with admin access
5. **Node.js 22.x** installed locally

## AWS Setup

### 1. Create IAM User for GitHub Actions

1. **Navigate to IAM** in AWS Console
2. **Create new user**: `github-actions-deployer`
3. **Attach policies**:
   - `AdministratorAccess-AWSElasticBeanstalk`
   - `AmazonS3FullAccess` (for deployment artifacts)
4. **Create access key** → Save `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

### 2. Create RDS PostgreSQL Database

#### Option A: Using AWS Console

1. **Navigate to RDS** → Create database
2. **Choose configuration**:
   - Engine: PostgreSQL 16.x
   - Template: Free tier (or Production for scaling)
   - DB instance: `socket-io-canvas-db`
   - Master username: `postgres`
   - Master password: (generate secure password)
   - Instance type: `db.t3.micro` (free tier eligible)
   - Storage: 20 GB GP3 (free tier: 20 GB)
   - Public access: No
   - VPC: Default VPC (or create new)
   - Database name: `socketio_canvas`

3. **Security group**: Allow inbound PostgreSQL (5432) from Elastic Beanstalk security group

4. **Copy connection details**:
   ```
   Endpoint: socket-io-canvas-db.xxxxxx.us-east-1.rds.amazonaws.com
   Port: 5432
   Database: socketio_canvas
   ```

#### Option B: Using AWS CLI

```bash
aws rds create-db-instance \
  --db-instance-identifier socket-io-canvas-db-2 \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 17.4 \
  --master-username postgres \
  --master-user-password "SECURE_PASSWORD" \
  --allocated-storage 20 \
  --db-name socketio_canvas \
  --backup-retention-period 7 \
  --no-publicly-accessible \
  --region us-east-2
```

#### Option C: Skip RDS (Use SQLite)

For testing purposes, you can skip RDS and use SQLite:
- Set `DATABASE_URL="file:./dev.db"` in Elastic Beanstalk environment
- Not recommended for production (data lost on instance replacement)

### 3. Create Elastic Beanstalk Application

#### Using AWS Console

1. **Navigate to Elastic Beanstalk** → Create application

2. **Application settings**:
   - Application name: `socket-io-canvas`
   - Platform: Node.js 22 running on 64bit Amazon Linux 2023
   - Platform branch: Node.js 22
   - Application code: Sample application (we'll deploy via GitHub Actions)

3. **Environment settings**:
   - Environment name: `socket-io-canvas-prod`
   - Domain: (auto-generated or custom)

4. **Configure service access**:
   - Create new service role (auto-created)
   - EC2 instance profile: Create new (with basic permissions)

5. **Networking**:
   - VPC: Same as RDS database
   - Enable public IP: Yes
   - Instance subnets: Select at least 2 availability zones

6. **Instance settings**:
   - Instance type: `t3.micro` (free tier) or `t3.small` (production)
   - Security groups: Allow HTTP (80), HTTPS (443)

7. **Create environment** (takes ~5 minutes)

#### Using EB CLI

```bash
# Initialize EB in project directory
eb init -p node.js-22 -r us-east-1 socket-io-canvas

# Create environment
eb create socket-io-canvas-prod \
  --instance-type t3.micro \
  --platform "Node.js 22 running on 64bit Amazon Linux 2023"
```

### 4. Configure Environment Variables

Navigate to **Elastic Beanstalk** → **socket-io-canvas-prod** → **Configuration** → **Software** → **Edit**

Add environment properties:

```bash
NODE_ENV=production
PORT=8080

# JWT Configuration
JWT_SECRET=<generate-secure-secret-here>

# Database Configuration (PostgreSQL)
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@socket-io-canvas-db.xxxxxx.us-east-1.rds.amazonaws.com:5432/socketio_canvas

# Client URL (your frontend URL)
CLIENT_URL=https://your-frontend-url.com

# NPM Configuration
NPM_USE_PRODUCTION=false
```

**Generate JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

**Important**: Set `NPM_USE_PRODUCTION=false` to ensure Prisma dependencies are installed.

### 5. Update Security Groups

1. **Get Elastic Beanstalk security group ID**:
   - Go to EC2 → Security Groups
   - Find group named `sg-elasticbeanstalk-...`

2. **Update RDS security group**:
   - Go to RDS → Databases → socket-io-canvas-db → VPC security groups
   - Edit inbound rules
   - Add rule: PostgreSQL (5432) from EB security group

## GitHub Actions Setup

### 1. Add GitHub Secrets

Navigate to **GitHub repository** → **Settings** → **Secrets and variables** → **Actions**

Add the following repository secrets:

- `AWS_ACCESS_KEY_ID`: From IAM user creation
- `AWS_SECRET_ACCESS_KEY`: From IAM user creation

### 2. Verify Workflow Configuration

The workflow file is located at `.github/workflows/deploy-aws.yml`:

```yaml
# Key settings (verify these match your setup):
application_name: socket-io-canvas
environment_name: socket-io-canvas-prod
region: us-east-1
```

**Update if needed:**
- Change `application_name` if you used a different name
- Change `environment_name` if you used a different environment name
- Change `region` if deploying to different AWS region

### 3. Deploy

**Automatic deployment** on push to `main`:

```bash
git add .
git commit -m "Deploy to AWS"
git push origin main
```

**Manual deployment** via GitHub Actions:
- Go to **Actions** tab → **Deploy to AWS Elastic Beanstalk** → **Run workflow**

**Monitor deployment**:
- GitHub Actions tab shows real-time logs
- Elastic Beanstalk console shows environment status
- Deployment takes ~5-10 minutes

## Manual Deployment (EB CLI)

### Install EB CLI

```bash
pip install awsebcli
```

### Initialize and Deploy

```bash
# Initialize (if not already done)
eb init -p node.js-22 socket-io-canvas

# Deploy to environment
eb deploy socket-io-canvas-prod

# Open application in browser
eb open

# View logs
eb logs

# SSH into instance
eb ssh
```

### Environment Management

```bash
# List environments
eb list

# Check status
eb status

# Set environment variables
eb setenv JWT_SECRET=your-secret-key

# Scale instances
eb scale 2

# Terminate environment
eb terminate socket-io-canvas-prod
```

## Post-Deployment

### 1. Verify Deployment

```bash
# Get environment URL
eb status | grep CNAME

# Or from AWS Console
# Elastic Beanstalk → socket-io-canvas-prod → Domain
```

Visit: `http://socket-io-canvas-prod.us-east-1.elasticbeanstalk.com`

### 2. Test Endpoints

```bash
# Health check
curl http://your-app-url.elasticbeanstalk.com/health

# Expected response:
# {"status":"ok","timestamp":"2024-11-06T..."}
```

### 3. Seed Database (Optional)

```bash
# SSH into instance
eb ssh

# Run seed script
cd /var/app/current
npx prisma db seed

# Exit
exit
```

### 4. Configure Custom Domain (Optional)

1. **Route 53** → Create hosted zone for your domain
2. **Elastic Beanstalk** → Environment → Configuration → Load balancer
3. Add SSL certificate (AWS Certificate Manager)
4. Update `CLIENT_URL` environment variable

## Monitoring and Logs

### CloudWatch Logs

Elastic Beanstalk automatically streams logs to CloudWatch:

1. **AWS Console** → CloudWatch → Logs → Log groups
2. Find: `/aws/elasticbeanstalk/socket-io-canvas-prod/var/log/nodejs/nodejs.log`

### View Logs via EB CLI

```bash
# Real-time logs
eb logs --stream

# Download all logs
eb logs --all

# Specific log file
eb logs --log-group /aws/elasticbeanstalk/socket-io-canvas-prod/var/log/web.stdout.log
```

### Application Monitoring

**Elastic Beanstalk Dashboard**:
- Environment health (Enhanced monitoring)
- Request rate and latency
- CPU, memory, network usage
- 4xx/5xx error rates

**CloudWatch Metrics**:
- Custom Socket.IO connection metrics
- Database query performance
- Application-specific events

## Troubleshooting

### Deployment Fails

**Check GitHub Actions logs**:
```
Actions tab → Failed workflow → View logs
```

**Common issues**:
1. **IAM permissions**: Verify GitHub Actions user has correct policies
2. **Application name mismatch**: Check workflow YAML matches EB app name
3. **Tests failing**: Fix tests or temporarily disable in workflow

### Application Won't Start

**Check environment logs**:
```bash
eb logs --all
```

**Common issues**:
1. **DATABASE_URL missing**: Set environment variable
2. **Prisma migrations fail**: Check database connectivity
3. **Port mismatch**: Ensure app listens on `process.env.PORT`
4. **Node version**: Verify Node.js 22 platform selected

### WebSocket Connections Fail

**Verify Nginx configuration**:
```bash
eb ssh
sudo cat /etc/nginx/conf.d/websocket_upgrade.conf
```

**Check load balancer settings**:
- Enable sticky sessions (session affinity)
- Increase timeout to 300+ seconds

**Test WebSocket upgrade**:
```bash
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: your-app.elasticbeanstalk.com" \
  http://your-app.elasticbeanstalk.com/socket.io/
```

### Database Connection Issues

**Verify security groups**:
```bash
# Test from EB instance
eb ssh
telnet socket-io-canvas-db.xxxxxx.rds.amazonaws.com 5432
```

**Check DATABASE_URL format**:
```
postgresql://username:password@host:5432/database?schema=public
```

**RDS instance status**:
- Ensure RDS instance is "Available"
- Check security group allows inbound from EB instances

### High Memory/CPU Usage

**Scale vertically**:
```bash
# Upgrade instance type
eb scale --instance-type t3.small
```

**Scale horizontally**:
```bash
# Add more instances
eb scale 3
```

**Enable auto-scaling**:
- Configuration → Capacity → Auto Scaling
- Min: 1, Max: 4
- Triggers: CPU > 70%, Network out > 6MB

## Cost Optimization

### Free Tier Eligible Setup

**Components**:
- EB Environment: 1x t3.micro EC2 instance (750 hrs/month free)
- RDS: 1x db.t3.micro PostgreSQL (750 hrs/month free, 20GB storage)
- Data transfer: 15 GB/month free
- Load Balancer: Not free (~$16/month for ALB)

**Estimated cost (after free tier)**: $5-20/month

### Cost-Saving Tips

1. **Single instance (no load balancer)**:
   - Configuration → Capacity → Environment type → Single instance
   - Saves $16/month, but loses high availability

2. **Schedule environment shutdown**:
   ```bash
   # Stop environment during off-hours
   eb terminate socket-io-canvas-prod --force

   # Recreate when needed
   eb create socket-io-canvas-prod
   ```

3. **Use SQLite instead of RDS**:
   - Good for low-traffic staging environments
   - Not recommended for production

4. **Reserved instances**:
   - Commit to 1-year reserved instance for 30%+ savings

5. **Monitor costs**:
   - Set up billing alerts in AWS Console
   - Use AWS Cost Explorer

### Production-Ready Setup (~$50-100/month)

- EB: 2x t3.small instances with auto-scaling
- RDS: db.t3.small with Multi-AZ (~$50/month)
- Application Load Balancer with SSL
- CloudWatch detailed monitoring
- Automated backups and snapshots

## Additional Resources

- [AWS Elastic Beanstalk Node.js Docs](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-nodejs.html)
- [Socket.IO on AWS](https://socket.io/docs/v4/using-multiple-nodes/)
- [Prisma on AWS](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-aws-lambda)
- [GitHub Actions AWS Deploy](https://github.com/einaregilsson/beanstalk-deploy)

## Next Steps

1. **Set up staging environment**: Create `socket-io-canvas-staging` for testing
2. **Configure HTTPS**: Add SSL certificate via AWS Certificate Manager
3. **Set up monitoring**: CloudWatch dashboards and alarms
4. **Database backups**: Configure automated RDS snapshots
5. **CI/CD pipeline**: Add integration tests, linting, and code coverage

---

For Heroku deployment, see [HEROKU_DEPLOY.md](./HEROKU_DEPLOY.md)
