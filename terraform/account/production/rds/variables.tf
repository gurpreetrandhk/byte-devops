variable "region" {
  type    = string
  default = "ap-south-1"
}

variable "vpc_name" {
  description = "Name tag of the existing application VPC."
  type        = string
  default     = "supernova-vpc"
}

variable "ec2_security_group_name" {
  description = "Name tag of the existing application EC2 security group."
  type        = string
  default     = "supernova-server-01-sg"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
  validation {
    condition     = contains(["db.t3.micro", "db.t4g.micro"], var.instance_class)
    error_message = "Choose db.t3.micro or db.t4g.micro."
  }
}

variable "db_password" {
  description = "Self-managed master password; supply through TF_VAR_db_password."
  type        = string
  sensitive   = true
  ephemeral   = true
}

variable "password_version" {
  description = "Increment when changing db_password to rotate the RDS password."
  type        = number
  default     = 1
}
