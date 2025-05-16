terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  required_version = ">= 1.2.0"
}

provider "aws" {
  region = var.aws_region
  
  # Free tier resources generally have constraints, so we'll set defaults for tagging
  default_tags {
    tags = {
      Project     = "doctor-scheduler"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

# Use the default VPC and subnets for simplicity and to stay within free tier
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Random string for unique resource naming
resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
} 