terraform {
  required_version = ">= 1.11.1"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.37, < 7.0"
    }
  }
}

provider "aws" {
  region = var.region
}
