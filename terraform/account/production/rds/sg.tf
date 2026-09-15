data "aws_vpc" "existing" {
  filter {
    name   = "tag:Name"
    values = [var.vpc_name]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing.id]
  }
  filter {
    name   = "tag:Name"
    values = ["${var.vpc_name}-private-*"]
  }
  lifecycle {
    postcondition {
      condition     = length(self.ids) >= 2
      error_message = "The existing VPC must have at least two private subnets in different Availability Zones."
    }
  }
}

data "aws_security_group" "ec2" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing.id]
  }
  filter {
    name   = "tag:Name"
    values = [var.ec2_security_group_name]
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "byte-postgres-"
  description = "Private PostgreSQL access from application EC2 only"
  vpc_id      = data.aws_vpc.existing.id
  tags = {
    Name        = "byte-postgres-sg"
    Environment = "production"
    ManagedBy   = "Terraform"
  }
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "postgres" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = data.aws_security_group.ec2.id
  description                  = "PostgreSQL from application EC2"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
