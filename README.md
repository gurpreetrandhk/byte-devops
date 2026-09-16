# byte-devops
will start from the infra creation first
# 8Byte DevOps Assignment

This repository contains my solution for the DevOps assignment. I used Terraform to create the AWS infrastructure, Docker to containerize the application, and GitHub Actions for CI/CD.

## Architecture

```text
Internet
   |
   v
Application Load Balancer
   |
   +----------+
   |          |
   v          v
 EC2-1      EC2-2
 Nginx      Nginx
   |          |
   v          v
 Docker     Docker
 Flask      Flask
   |          |
   +----+-----+
        |
        v
   RDS PostgreSQL
```

The application runs inside Docker on port 8080. Nginx runs on the EC2 instances on port 80 and forwards traffic to the container.

## AWS Services Used

- VPC
- EC2
- Application Load Balancer
- RDS PostgreSQL
- ECR
- Secrets Manager
- Systems Manager (SSM)
- CloudWatch
- IAM

## Terraform

Terraform code is under the `terraform` directory.

Production resources are separated by component:

```text
terraform/account/production/
├── vpc/
├── ec2/
├── alb/
├── rds/
└── ecr/
```

Reusable modules are stored under:

```text
terraform/modules/
```

This makes it easier to keep the infrastructure organized and reuse the same modules for other environments.

Basic Terraform commands:

```bash
terraform init
terraform validate
terraform plan
terraform apply
```

## Application

The sample application is written in Python using Flask.

Main endpoints:

```text
GET  /
GET  /health
GET  /health/db
GET  /users
POST /users
```

`/health` is used to check whether the application is running.

`/health/db` also checks connectivity with PostgreSQL.

## Docker

The application is packaged as a Docker image and runs using Gunicorn.

To build locally:

```bash
cd app
docker build -t byte-app .
```

The CI/CD pipeline pushes the production image to Amazon ECR.

## CI/CD

The GitHub Actions workflow is available at:

```text
.github/workflows/ci-cd.yml
```

The pipeline performs:

```text
Code Push
   |
   v
Run Tests
   |
   v
Trivy Scan
   |
   v
Build Docker Image
   |
   v
Push to ECR
   |
   v
Deploy through SSM
   |
   v
EC2-1 + EC2-2
   |
   v
ALB Health Check
```

I use the Git commit SHA as the Docker image tag so that a deployed image can be traced back to the source-code version.

## Deployment

I used AWS Systems Manager instead of copying the application to the servers using SSH.

During deployment, SSM runs the deployment commands on both EC2 instances.

Each server:

1. Pulls the new image from ECR.
2. Gets the database credentials from Secrets Manager.
3. Stops the old container.
4. Starts the new container.
5. Checks the `/health` endpoint.

After that, the GitHub workflow checks the application through the ALB.

## Secrets

Database credentials are not stored in the repository.

They are stored in AWS Secrets Manager.

The EC2 instances have an IAM role that allows them to read the required secret. During deployment, the EC2 server retrieves it and passes the required database values to the Docker container as environment variables.

```text
Secrets Manager
      |
      v
EC2 IAM Role
      |
      v
EC2
      |
      v
Docker
      |
      v
Flask
      |
      v
RDS
```

This means the database password does not need to be stored in the application code.

## Load Balancer and Nginx

The Application Load Balancer sends HTTP traffic to both EC2 instances.

Nginx listens on port 80 on each EC2 server and forwards the request to the application container running on port 8080.

```text
ALB :80
   |
Nginx :80
   |
Docker :8080
```

## Monitoring

I used CloudWatch to monitor the infrastructure.

I created two dashboards:

### Infrastructure Dashboard

Used for EC2, RDS and ALB health.

Some of the metrics included are:

- EC2 CPU utilization
- RDS CPU utilization
- Database connections
- Free storage
- Healthy targets
- Unhealthy targets

### Application Dashboard

Used for application/load-balancer traffic.

It includes:

- Request count
- Target response time
- HTTP 4xx
- HTTP 5xx

## Logging

CloudWatch Agent is installed on the EC2 instances.

Nginx logs are sent to CloudWatch Logs:

```text
/byte-app/nginx/access
/byte-app/nginx/error
```

Each EC2 instance has its own log stream, which makes it easier to identify which server handled a request or generated an error.

I configured a 7-day retention period for these logs.

## Testing

The application tests are written using pytest.

Run them locally with:

```bash
cd app
pip install -r requirements.txt
pytest -v
```

The tests also run automatically in GitHub Actions.

## Security

Some of the security decisions I used in this project are:

- Database credentials stored in Secrets Manager
- IAM roles for EC2
- Security groups between ALB, EC2 and RDS
- SSM for deployment instead of CI/CD SSH access
- Non-root user inside the Docker container
- Trivy image scanning
- Sensitive/generated files excluded using `.gitignore`

For a production setup, I would also replace long-lived GitHub AWS credentials with GitHub OIDC and temporary AWS credentials.

## Issues I Faced

### ALB returned 502

Initially the application was running on port 8080 while the target group was using port 80.

I solved this by running Nginx on the EC2 instances. Nginx accepts requests on port 80 and forwards them to the Docker container on port 8080.

### Database initialization

The application is started using Gunicorn, so initialization code under the normal Python main block was not executed.

I initialized the database separately and verified it using the `/health/db` endpoint.

### Deploying to both servers

One of the EC2 instances initially did not have the same Docker setup as the other server.

After fixing the server configuration, I used the same ECR image and SSM deployment process for both instances.

## Improvements

If I had more time, I would add:

- GitHub OIDC authentication
- HTTPS using ACM
- Auto Scaling
- CloudWatch alarms and notifications
- Automated database migrations
- A fully deployed staging environment
- Remote Terraform state with locking
- Blue/green deployment

## Repository Structure

```text
.
├── .github/workflows/ci-cd.yml
├── app/
│   ├── Dockerfile
│   ├── app.py
│   ├── db.py
│   ├── requirements.txt
│   └── tests/
├── terraform/
│   ├── account/
│   │   ├── production/
│   │   └── staging/
│   └── modules/
└── README.md
```
