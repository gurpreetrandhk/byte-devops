variable "region" {
  description = "AWS region containing the VPC and ALB."
  type        = string
  default     = "ap-south-1"
}

variable "name" {
  type    = string
  default = "supernova-prod-alb"

}

variable "vpc_id" {
  description = "Existing production VPC ID."
  type        = string
  
}

variable "internal" {
  type    = bool
  default = false
}





variable "backend_port" {
  type    = number
  default = 80
}

variable "health_check_path" {
  type    = string
  default = "/"
}

variable "access_logs_bucket" {
  description = "Optional existing S3 bucket configured to accept ALB access logs."
  type        = string
  default     = null
}


variable "subnet_ids" {
  type = set(string)
}

variable "allowed_ipv4_cidrs" {
  type = set(string)
}

variable "backend_security_group_id" {
  type = string
}