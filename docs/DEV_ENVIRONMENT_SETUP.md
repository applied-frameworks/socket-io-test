# Dev Environment Setup Notes

## Environment Overview

**Branch**: `dev`
**Environment Name**: `socket-io-canvas-dev`
**URL**: `https://dev-labs.appliedframeworks.com`
**SSL Certificate ARN**: `arn:aws:acm:us-east-2:423669885238:certificate/b02462fd-c9de-44f4-a06c-6a58d8867e7c`

## DNS Configuration Required

### 1. SSL Certificate Validation (URGENT)
Add this CNAME record to validate the SSL certificate:

- **Type**: CNAME
- **Name**: `_93e3371e999f704d97c9a26a1304dfad.dev-labs.appliedframeworks.com`
- **Value**: `_f8a22b61ae82a82146f341ae377d48d3.jkddzztszm.acm-validations.aws`

**Status**: Certificate is PENDING_VALIDATION until this DNS record is added

### 2. Application Domain Mapping
Add this CNAME record to point your domain to the Elastic Beanstalk environment:

- **Type**: CNAME
- **Name**: `dev-labs.appliedframeworks.com`
- **Value**: `socket-io-canvas-dev.eba-p7pycbaa.us-east-2.elasticbeanstalk.com`

## AWS Configuration Checklist

### 1. HTTPS Listener Configuration
Once the environment is ready and the SSL certificate is validated, configure the HTTPS listener:

```bash
# This will be done automatically, but verify:
aws elasticbeanstalk update-environment \
  --environment-name socket-io-canvas-dev \
  --region us-east-2 \
  --option-settings \
    Namespace=aws:elbv2:listener:443,OptionName=Protocol,Value=HTTPS \
    Namespace=aws:elbv2:listener:443,OptionName=SSLCertificateArns,Value=arn:aws:acm:us-east-2:423669885238:certificate/b02462fd-c9de-44f4-a06c-6a58d8867e7c \
    Namespace=aws:elbv2:listener:443,OptionName=DefaultProcess,Value=default
```

### 2. Environment Variables
Set these environment variables for the dev environment:

```bash
NODE_ENV=production
JWT_SECRET=42e43146e3f6514d9c83a83d185cfd21d2a44d829482af8a9b6c7287b368d271a3ff6b9f57bf952cfe871d497d87027712f33a40306771363d5918ccca230c1b
DATABASE_URL=file:./dev.db
CLIENT_URL=https://dev-labs.appliedframeworks.com
NPM_USE_PRODUCTION=false
```

**Note**: JWT_SECRET has been generated. For production, store securely in AWS Secrets Manager or Parameter Store.

### 3. Database Configuration
Options:
- Use SQLite (default): `DATABASE_URL="file:./dev.db"`
- Use AWS RDS PostgreSQL: Create a new RDS instance or use existing dev database

## Current Certificate Setup

| Environment | Domain | Certificate ARN |
|-------------|--------|----------------|
| prod (main) | labs.appliedframeworks.com | TBD |
| staging | staging-labs.appliedframeworks.com | `f634a912-a207-4652-be2a-4343d1026b3f` |
| dev | dev-labs.appliedframeworks.com | `b02462fd-c9de-44f4-a06c-6a58d8867e7c` |

## Configuration Files Updated

1. `.github/workflows/deploy-aws.yml` - Added dev branch deployment
2. `.elasticbeanstalk/config.yml` - Added dev branch mapping to socket-io-canvas-dev
3. Main branch now deploys to `socket-io-canvas-prod` (updated from socket-io-canvas-dev)

## Post-Setup Verification

After DNS and certificate are configured:

1. Wait for SSL certificate status to change from PENDING_VALIDATION to ISSUED
2. Verify HTTPS listener is configured on load balancer
3. Push to dev branch to trigger deployment
4. Verify application is accessible at https://dev-labs.appliedframeworks.com
5. Test WebSocket connections work properly over HTTPS

## Notes

- The `.ebextensions/https-listener.config` file contains a hardcoded certificate ARN for labs-dev.appliedframeworks.com
- This needs to be overridden per environment through EB configuration
- Each environment should use its own domain-specific certificate
