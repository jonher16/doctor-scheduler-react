# Doctor Scheduler AWS Deployment

This directory contains Terraform configuration to deploy the Doctor Scheduler application to AWS using free tier resources.

## Prerequisites

Before proceeding with the deployment, ensure you have the following:

1. **AWS CLI configured**: Run `aws configure` if you haven't already configured it.
2. **Terraform installed**: Version 1.2.0 or higher.
3. **Docker installed**: For building and pushing the container image.
4. **jq installed**: For JSON parsing in the deployment script.

## Security Considerations

Before deploying to AWS, ensure:

1. **AWS Credentials**: Never store AWS access keys in the repository. Use `aws configure` to store them securely.
2. **SSH Keys**: Never commit SSH private keys to version control.
3. **State Files**: Keep `terraform.tfstate` files secure as they may contain sensitive information.
4. **Firebase Configuration**: Use environment variables for Firebase API keys and never commit real values.

## Variables Configuration

Create a `terraform.tfvars` file (which is git-ignored) to store sensitive variables:

```hcl
firebase_api_key             = "your-firebase-api-key"
firebase_auth_domain         = "your-firebase-auth-domain"
firebase_project_id          = "your-firebase-project-id"
firebase_storage_bucket      = "your-firebase-storage-bucket"
firebase_messaging_sender_id = "your-firebase-messaging-sender-id"
firebase_app_id              = "your-firebase-app-id"
```

## Deployment Architecture

The deployment creates:
- An ECR repository for storing the Docker image
- A t2.micro EC2 instance (free tier eligible)
- Security groups for allowing traffic on ports 3000 (frontend), 5000 (backend API), and 22 (SSH)
- SSH key pair for connecting to the EC2 instance
- IAM roles and policies for ECR access

## Deployment Instructions

1. **Automatic Deployment**

   Run the provided deployment script:
   ```bash
   ./deploy_script.sh
   ```

   This script will:
   - Initialize Terraform
   - Create an ECR repository
   - Build and push the Docker image
   - Deploy the application to AWS
   - Output connection details

2. **Manual Deployment**

   If you prefer to deploy manually, follow these steps:

   a. Initialize Terraform:
   ```bash
   terraform init
   ```

   b. Apply the Terraform configuration:
   ```bash
   terraform apply
   ```

   c. Build and tag the Docker image:
   ```bash
   docker build -t doctor-scheduler ..
   docker tag doctor-scheduler:latest $(terraform output -raw ecr_repository_url):latest
   ```

   d. Log in to ECR:
   ```bash
   aws ecr get-login-password --region $(terraform output -raw aws_region) | docker login --username AWS --password-stdin $(terraform output -raw ecr_repository_url)
   ```

   e. Push the image to ECR:
   ```bash
   docker push $(terraform output -raw ecr_repository_url):latest
   ```

   f. Get connection details:
   ```bash
   terraform output
   ```

## Connecting to the Deployed Application

After deployment completes, you can:

- Access the frontend at: `http://<instance_public_ip>:3000`
- Access the backend API at: `http://<instance_public_ip>:5000`
- SSH into the instance using: `ssh -i <key_file> ec2-user@<instance_public_ip>`

## Updating the Deployed Application

To update the application after making changes:

```bash
./update_frontend.sh
```

## Cleaning Up

To destroy all created resources and avoid incurring charges, use the provided destroy script:

```bash
./destroy_script.sh
```

This script will:
- Check if the ECR repository exists and contains images
- Safely delete all images from the repository
- Run terraform destroy to remove all AWS resources

Alternatively, you can manually clean up the resources:

```bash
# First, empty the ECR repository (required before it can be deleted)
REPO_NAME="doctor-scheduler"
DIGEST_LIST=$(aws ecr list-images --repository-name "$REPO_NAME" --query 'imageIds[*].imageDigest' --output text)

for digest in $DIGEST_LIST; do
  aws ecr batch-delete-image \
    --repository-name "$REPO_NAME" \
    --image-ids imageDigest=$digest
done

# Then destroy all AWS resources
terraform destroy
```

You may encounter the following error if you try to destroy without emptying the repository first:
```
Error: ECR Repository not empty, consider using force_delete: operation error ECR: DeleteRepository, RepositoryNotEmptyException: The repository cannot be deleted because it still contains images
```

## Troubleshooting

If the application doesn't come up immediately:

1. SSH into the instance
2. Check Docker container status: `sudo docker ps`
3. Check EC2 cloud-init logs: `sudo cat /var/log/cloud-init-output.log`
4. Check Docker container logs: `sudo docker logs doctor-scheduler`

## Cost Consideration

While this setup uses mostly free tier resources:
- The EC2 t2.micro instance is free tier eligible for 12 months
- ECR provides 500MB of storage for free
- Elastic IP may incur costs if not attached to a running instance

Always remember to destroy resources when not in use to avoid unexpected charges. 