variable "aws_region" {
  description = "The AWS region resources will be created in"
  type        = string
  default     = "us-west-2"
}

variable "app_name" {
  description = "The name of the application"
  type        = string
  default     = "doctor-scheduler"
}

variable "app_port" {
  description = "Port exposed by the frontend application"
  type        = number
  default     = 3000
}

variable "api_port" {
  description = "Port exposed by the backend API"
  type        = number
  default     = 5000
}

variable "container_cpu" {
  description = "CPU units for the container (1024 = 1 vCPU)"
  type        = number
  default     = 256  # Low value for free tier
}

variable "container_memory" {
  description = "Memory for the container (in MiB)"
  type        = number
  default     = 512  # Low value for free tier
}

variable "desired_count" {
  description = "Number of desired container instances"
  type        = number
  default     = 1
}

variable "frontend_image_tag" {
  description = "Docker image tag for the frontend"
  type        = string
  default     = "latest"
}

variable "backend_image_tag" {
  description = "Docker image tag for the backend"
  type        = string
  default     = "latest"
}

variable "ecr_repository_name" {
  description = "Name of the ECR repository"
  type        = string
  default     = "doctor-scheduler"
}

# Docker environment variables
variable "docker_image_tag" {
  description = "The tag to use for the Docker image"
  type        = string
  default     = "latest"
}

# Firebase configuration
variable "firebase_api_key" {
  description = "Firebase API Key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "firebase_auth_domain" {
  description = "Firebase Auth Domain"
  type        = string
  default     = ""
  sensitive   = true
}

variable "firebase_project_id" {
  description = "Firebase Project ID"
  type        = string
  default     = ""
  sensitive   = true
}

variable "firebase_storage_bucket" {
  description = "Firebase Storage Bucket"
  type        = string
  default     = ""
  sensitive   = true
}

variable "firebase_messaging_sender_id" {
  description = "Firebase Messaging Sender ID"
  type        = string
  default     = ""
  sensitive   = true
}

variable "firebase_app_id" {
  description = "Firebase App ID"
  type        = string
  default     = ""
  sensitive   = true
}

# Tags
variable "default_tags" {
  description = "Default tags to apply to all resources"
  type        = map(string)
  default = {
    Environment = "production"
    ManagedBy   = "terraform"
    Project     = "doctor-scheduler"
  }
} 