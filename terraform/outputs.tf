# Consolidated outputs file
output "aws_region" {
  value       = var.aws_region
  description = "The AWS region where resources are deployed"
}

output "app_name" {
  value       = var.app_name
  description = "The name of the application"
}

# ECR repository outputs
output "ecr_repository_name" {
  value       = aws_ecr_repository.app_repo.name
  description = "The name of the ECR repository"
}

# EC2 related outputs are in ec2.tf for better modularity
# These are: instance_public_ip, ssh_command, frontend_url, backend_url 