#!/bin/bash
set -e

echo "=== Doctor Scheduler AWS Deployment Script ==="

# Initialize Terraform
echo "Initializing Terraform..."
terraform init

# Create ECR Repository first
echo "Creating ECR repository..."
terraform apply -target=aws_ecr_repository.app_repo -auto-approve

# Get repository URL
ECR_REPO_URL=$(terraform output -raw ecr_repository_url)
echo "ECR repository created: $ECR_REPO_URL"

# Build Docker image
echo "Building Docker image..."
cd ..
sudo docker build -t doctor-scheduler .

# Tag Docker image
echo "Tagging Docker image..."
sudo docker tag doctor-scheduler:latest $ECR_REPO_URL:latest

# Login to ECR
echo "Logging in to ECR..."
aws_region=$(terraform -chdir=terraform output -raw aws_region)
sudo aws ecr get-login-password --region $aws_region | sudo docker login --username AWS --password-stdin $ECR_REPO_URL

# Push Docker image to ECR
echo "Pushing Docker image to ECR..."
sudo docker push $ECR_REPO_URL:latest

# Apply Terraform configuration to create/update EC2 instance
echo "Applying Terraform configuration..."
cd terraform
terraform apply -auto-approve

# Get outputs
INSTANCE_IP=$(terraform output -raw instance_public_ip)
SSH_CMD=$(terraform output -raw ssh_command)
FRONTEND_URL=$(terraform output -raw frontend_url)
BACKEND_URL=$(terraform output -raw backend_url)

echo "=== Deployment Complete ==="
echo "EC2 Instance IP: $INSTANCE_IP"
echo "SSH Command: $SSH_CMD"
echo "Frontend URL: $FRONTEND_URL"
echo "Backend URL: $BACKEND_URL"
echo "Note: It may take a few minutes for the EC2 instance to finish initializing and pull the Docker image."
echo "You can check the status by SSH'ing into the instance and running:"
echo "sudo docker ps"
echo "sudo cat /var/log/cloud-init-output.log" 