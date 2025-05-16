#!/bin/bash
set -e

echo "=== Doctor Scheduler AWS Cleanup Script ==="

# Set default values
DEFAULT_REPO_NAME="doctor-scheduler"
DEFAULT_AWS_REGION="us-west-2"  # Change this to your preferred region if different

# Initialize Terraform if needed
if [ ! -f ".terraform.lock.hcl" ]; then
  echo "Initializing Terraform..."
  terraform init
fi

# Try to get ECR repository details, but fall back to defaults if needed
echo "Getting ECR repository information..."
REPO_NAME=$(terraform output -raw ecr_repository_name 2>/dev/null || echo "$DEFAULT_REPO_NAME")
AWS_REGION=$(terraform output -raw aws_region 2>/dev/null || echo "$DEFAULT_AWS_REGION")

echo "Repository name: $REPO_NAME"
echo "AWS Region: $AWS_REGION"

# Function to safely delete ECR images
delete_ecr_images() {
  echo "Checking for images in ECR repository..."
  
  # Check if repository exists
  if ! aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$AWS_REGION" &>/dev/null; then
    echo "Repository $REPO_NAME does not exist. Skipping image deletion."
    return 0
  fi
  
  # List images and check if any exist
  IMAGES=$(aws ecr list-images --repository-name "$REPO_NAME" --region "$AWS_REGION" --query 'imageIds[*]' --output json)
  
  if [ "$IMAGES" == "[]" ]; then
    echo "No images found in repository. Skipping deletion."
    return 0
  fi
  
  echo "Found images in repository. Deleting..."
  
  # Use a safer approach to delete images
  DIGEST_LIST=$(aws ecr list-images --repository-name "$REPO_NAME" --region "$AWS_REGION" --query 'imageIds[*].imageDigest' --output text)
  
  if [ -z "$DIGEST_LIST" ]; then
    echo "No image digests found. Skipping deletion."
    return 0
  fi
  
  for digest in $DIGEST_LIST; do
    echo "Deleting image with digest: $digest"
    aws ecr batch-delete-image \
      --repository-name "$REPO_NAME" \
      --region "$AWS_REGION" \
      --image-ids imageDigest=$digest
  done
  
  echo "Successfully deleted all images from repository."
}

# Delete ECR images
delete_ecr_images

# Destroy Terraform resources
echo "Destroying Terraform resources..."
terraform destroy -auto-approve

echo "=== Cleanup Complete ==="
echo "All AWS resources have been destroyed." 