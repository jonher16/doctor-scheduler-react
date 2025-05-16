# Create a key pair for EC2 instances
resource "aws_key_pair" "app_key" {
  key_name   = "${var.app_name}-key-${random_string.suffix.result}"
  public_key = tls_private_key.app_key.public_key_openssh
}

# Generate an SSH key for connecting to EC2 instances
resource "tls_private_key" "app_key" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

# Save private key locally
resource "local_file" "private_key" {
  content  = tls_private_key.app_key.private_key_pem
  filename = "${path.module}/${var.app_name}-key-${random_string.suffix.result}.pem"
  file_permission = "0400"  # Ensure proper permissions for the key file
}

# Security group for application
resource "aws_security_group" "app_sg" {
  name        = "${var.app_name}-sg-${random_string.suffix.result}"
  description = "Security group for ${var.app_name} application"
  vpc_id      = data.aws_vpc.default.id

  # Frontend port
  ingress {
    from_port   = var.app_port
    to_port     = var.app_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow frontend traffic"
  }

  # Backend API port
  ingress {
    from_port   = var.api_port
    to_port     = var.api_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow backend API traffic"
  }

  # SSH access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow SSH access"
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "${var.app_name}-sg"
  }
} 