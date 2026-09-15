variable "region" {
  description = "AWS region for the server."
  type        = string
  default     = "ap-south-1"
}

variable "account" {
  description = "Account label for resource tags."
  type        = string
  default     = "supernova"
}

variable "name" {
  description = "Server name."
  type        = string
  default     = "supernova-server-01"
}



variable "subnet_name" {
  description = "Name tag of the existing subnet shared by the instances. Use a public subnet for public-server internet access."
  type        = string
  default     = "supernova-vpc-public-ap-south-1a"
}


variable "ssh_allowed_ipv4_cidrs" {
  description = "Trusted IPv4 CIDRs allowed to SSH to the instances. Empty disables SSH ingress."
  type        = set(string)
  default     = []
  validation {
    condition     = alltrue([for cidr in var.ssh_allowed_ipv4_cidrs : can(cidrnetmask(cidr))])
    error_message = "Each SSH source must be a valid IPv4 CIDR."
  }
}

variable "instance_type" {
  description = "EC2 instance type."
  type        = string
  default     = "t3.micro"
}



variable "common_tags" {
  description = "Common tags applied to AWS resources"

  type = map(string)

  default = {
    Account     = "production"
    Environment = "production"
  }
}

variable "ami" {
  type        = string
  description = "AMI ID in the selected AWS region."
  default     = "ami-098f18a6382fb4b2d"
}

variable "pem_key" {
  type        = string
  default     = "supernova"
  description = "Existing EC2 key pair name."
}

variable "vpc" {
  default = "supernova-vpc"
  type    = string
}
