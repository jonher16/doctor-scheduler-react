# EC2 instance for the application
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# IAM role for EC2 to access ECR
resource "aws_iam_role" "ec2_role" {
  name = "doctor-scheduler-ec2-role-${random_string.suffix.result}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  inline_policy {
    name = "ecr-access"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Action = [
            "ecr:GetAuthorizationToken",
            "ecr:BatchCheckLayerAvailability",
            "ecr:GetDownloadUrlForLayer",
            "ecr:BatchGetImage"
          ]
          Effect   = "Allow"
          Resource = "*"
        }
      ]
    })
  }

  tags = {
    Name = "doctor-scheduler-ec2-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecr_access" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
}

resource "aws_iam_instance_profile" "ec2_profile" {
  name = "doctor-scheduler-profile-${random_string.suffix.result}"
  role = aws_iam_role.ec2_role.name
}

# Create the EC2 instance
resource "aws_instance" "app_instance" {
  ami           = data.aws_ami.amazon_linux_2.id
  instance_type = "t2.micro"
  key_name      = aws_key_pair.app_key.key_name

  vpc_security_group_ids = [aws_security_group.app_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  user_data = <<-EOF
#!/bin/bash
set -e

# Install Docker
yum update -y
yum install -y docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

# Install AWS CLI
yum install -y aws-cli

# Create app directory
mkdir -p /app

# Login to ECR
aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.app_repo.repository_url}

# Get the instance's public IP
HOST_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Create a start-app.sh script
cat > /app/start-app.sh << 'STARTAPP'
#!/bin/bash
aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.app_repo.repository_url}
docker-compose -f /app/docker-compose.yml pull
docker-compose -f /app/docker-compose.yml up -d
STARTAPP

chmod +x /app/start-app.sh

# Create docker-compose.yml
cat > /app/docker-compose.yml << 'DOCKER_COMPOSE'
version: '3'
services:
  doctor-scheduler:
    image: ${aws_ecr_repository.app_repo.repository_url}:latest
    container_name: doctor-scheduler
    ports:
      - "3000:3000"
      - "5000:5000"
    environment:
      - VITE_FIREBASE_API_KEY=${var.firebase_api_key}
      - VITE_FIREBASE_AUTH_DOMAIN=${var.firebase_auth_domain}
      - VITE_FIREBASE_PROJECT_ID=${var.firebase_project_id}
      - VITE_FIREBASE_STORAGE_BUCKET=${var.firebase_storage_bucket}
      - VITE_FIREBASE_MESSAGING_SENDER_ID=${var.firebase_messaging_sender_id}
      - VITE_FIREBASE_APP_ID=${var.firebase_app_id}
    restart: always
DOCKER_COMPOSE

# Replace the placeholder with the actual IP
sed -i "s/HOST_IP_PLACEHOLDER/$HOST_IP/g" /app/docker-compose.yml

# Start the application
/app/start-app.sh
EOF

  tags = {
    Name = "doctor-scheduler-app"
  }

  root_block_device {
    volume_size = 20
    volume_type = "gp2"
  }
}

# Elastic IP for the EC2 instance
resource "aws_eip" "app_eip" {
  instance = aws_instance.app_instance.id
  domain   = "vpc"

  tags = {
    Name = "doctor-scheduler-eip"
  }
}

# Outputs
output "instance_public_ip" {
  value       = aws_eip.app_eip.public_ip
  description = "The public IP address of the EC2 instance"
}

output "ssh_command" {
  value       = "ssh -i ./${local_file.private_key.filename} ec2-user@${aws_eip.app_eip.public_ip}"
  description = "Command to SSH into the EC2 instance"
}

output "frontend_url" {
  value       = "http://${aws_eip.app_eip.public_ip}:3000"
  description = "URL to access the frontend"
}

output "backend_url" {
  value       = "http://${aws_eip.app_eip.public_ip}:5000"
  description = "URL to access the backend API"
} 