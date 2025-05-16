# Doctor Scheduler Application

A comprehensive application for scheduling doctors in a hospital environment, with optimization algorithms to ensure fair distribution of shifts while respecting constraints.

## Deployment Options

This application can be deployed in three ways:
1. **Local Development**: Run directly on your machine using `run.sh`
2. **Docker Deployment**: Run in a Docker container
3. **AWS Deployment**: Deploy to Amazon Web Services using Terraform

## Prerequisites

- **For Local Development**:
  - Node.js 16+
  - Python 3.8+
  - Nginx (for the reverse proxy)
  - Git

- **For Docker Deployment**:
  - Docker Engine
  - Docker Compose

- **For AWS Deployment**:
  - AWS Account
  - AWS CLI configured
  - Terraform 1.2+
  - Docker
  - jq (for JSON parsing)

## Environment Setup

Before using the application, you need to set up the following environment:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/doctor-scheduler.git
   cd doctor-scheduler
   ```

2. **Set up Firebase** (optional - needed for authentication):
   - Create a Firebase project at [firebase.google.com](https://firebase.google.com/)
   - Enable Authentication and Cloud Firestore
   - Create a web app in your Firebase project
   - Copy the Firebase configuration values

3. **Configure environment variables**:
   - Copy the example environment file:
     ```bash
     cp frontend/.env.example frontend/.env
     ```
   - Update `frontend/.env` with your Firebase configuration values

## Option 1: Local Development

### Initial Setup

1. **Set up backend**:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

2. **Set up frontend**:
   ```bash
   cd frontend
   npm install
   cd ..
   ```

3. **Ensure Nginx is installed**:
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install nginx

   # CentOS/RHEL
   sudo yum install nginx

   # macOS
   brew install nginx
   ```

### Running the Application

1. **Make the run script executable**:
   ```bash
   chmod +x run.sh
   ```

2. **Start the application**:
   ```bash
   ./run.sh
   ```

3. **Access the application**:
   - Open your browser to http://localhost:3000

## Option 2: Docker Deployment

### Initial Setup

1. **Configure Docker Compose**:
   - Copy the example Docker Compose file:
     ```bash
     cp docker-compose.example.yml docker-compose.yml
     ```
   - Update the Firebase environment variables in `docker-compose.yml`

### Running with Docker

1. **Build and start the containers**:
   ```bash
   docker-compose up -d --build
   ```

2. **Access the application**:
   - Open your browser to http://localhost:3000

3. **View logs**:
   ```bash
   docker-compose logs -f
   ```

4. **Stop the containers**:
   ```bash
   docker-compose down
   ```

### Exporting the Docker Image (for distribution)

If you need to distribute the application without Git access:

1. **Build the Docker image**:
   ```bash
   docker-compose build
   ```

2. **Export the image to a file**:
   ```bash
   chmod +x export-docker-image.sh
   ./export-docker-image.sh
   ```

3. **The exported image** (`doctor-scheduler-image.tar`) can be distributed and imported on another machine with:
   ```bash
   docker load -i doctor-scheduler-image.tar
   ```

## Option 3: AWS Deployment

### Initial Setup

1. **Configure AWS credentials**:
   ```bash
   aws configure
   ```

2. **Navigate to the Terraform directory**:
   ```bash
   cd terraform
   ```

3. **Initialize Terraform**:
   ```bash
   terraform init
   ```

### Automatic Deployment

1. **Make the deployment script executable**:
   ```bash
   chmod +x deploy_script.sh
   ```

2. **Run the deployment script**:
   ```bash
   ./deploy_script.sh
   ```

   This script will:
   - Create an ECR repository
   - Build and push the Docker image
   - Deploy the EC2 instance and other resources
   - Output the connection details

3. **Access the deployed application**:
   - Frontend: http://<INSTANCE_IP>:3000
   - Backend API: http://<INSTANCE_IP>:5000

### Manual Deployment Steps

If you prefer to deploy step by step:

1. **Create the ECR repository**:
   ```bash
   terraform apply -target=aws_ecr_repository.app_repo -auto-approve
   ```

2. **Get the repository URL**:
   ```bash
   export ECR_REPO_URL=$(terraform output -raw ecr_repository_url)
   ```

3. **Build and tag the Docker image**:
   ```bash
   cd ..
   docker build -t doctor-scheduler .
   docker tag doctor-scheduler:latest $ECR_REPO_URL:latest
   ```

4. **Log in to ECR**:
   ```bash
   aws_region=$(terraform -chdir=terraform output -raw aws_region)
   aws ecr get-login-password --region $aws_region | docker login --username AWS --password-stdin $ECR_REPO_URL
   ```

5. **Push the image to ECR**:
   ```bash
   docker push $ECR_REPO_URL:latest
   ```

6. **Deploy the infrastructure**:
   ```bash
   cd terraform
   terraform apply -auto-approve
   ```

7. **Get the deployment details**:
   ```bash
   echo "EC2 Instance IP: $(terraform output -raw instance_public_ip)"
   echo "SSH Command: $(terraform output -raw ssh_command)"
   echo "Frontend URL: $(terraform output -raw frontend_url)"
   echo "Backend URL: $(terraform output -raw backend_url)"
   ```

### Connecting to the EC2 Instance

1. **The deployment creates an SSH key** in the terraform directory
2. **SSH into the instance**:
   ```bash
   ssh -i terraform/doctor-scheduler-key-*.pem ec2-user@<INSTANCE_IP>
   ```

### Updating the Deployed Application

To update the application after changes:

1. **Navigate to the terraform directory**:
   ```bash
   cd terraform
   ```

2. **Make the update script executable**:
   ```bash
   chmod +x update_frontend.sh
   ```

3. **Run the update script**:
   ```bash
   ./update_frontend.sh
   ```

### Cleaning Up AWS Resources

To avoid ongoing charges:

```bash
cd terraform
terraform destroy -auto-approve
```

## Security Considerations

Before deploying to production or pushing to GitHub:

1. **Never commit sensitive information**:
   - API keys
   - Private SSH keys
   - Database credentials
   - Environment files with real values

2. **Use environment variables** for all sensitive values

3. **Ensure proper permissions** on SSH keys when deployed:
   ```bash
   chmod 400 terraform/doctor-scheduler-key-*.pem
   ```

## Troubleshooting

### Local Development

- **Backend not starting**: Check your Python environment and requirements
- **Nginx errors**: Make sure Nginx is installed and there are no port conflicts
- **Frontend not connecting to backend**: Check the API URL configuration

### Docker Deployment

- **Container not starting**: Check Docker logs with `docker-compose logs`
- **API connection issues**: Verify environment variables in docker-compose.yml

### AWS Deployment

- **Deployment failure**: Check Terraform output for specific errors
- **Application not accessible**: Verify security group rules are allowing traffic
- **Backend issues**: SSH into the instance and check Docker logs:
  ```bash
  ssh -i terraform/doctor-scheduler-key-*.pem ec2-user@<INSTANCE_IP> 'sudo docker logs doctor-scheduler'
  ```
- **Configuration issues**: Check cloud-init logs:
  ```bash
  ssh -i terraform/doctor-scheduler-key-*.pem ec2-user@<INSTANCE_IP> 'sudo cat /var/log/cloud-init-output.log'
  ```

## Contributing

1. Create a feature branch
2. Make your changes
3. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.