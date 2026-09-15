resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-"
  description = "Production ALB client access and application traffic"
  vpc_id      = var.vpc_id
  tags        = { Name = "${var.name}-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  for_each          = var.allowed_ipv4_cidrs
  security_group_id = aws_security_group.alb.id
  description       = "HTTP client traffic"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Application traffic and health checks"
  referenced_security_group_id = var.backend_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = var.backend_port
  to_port                      = var.backend_port
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = var.backend_security_group_id
  description                  = "Application traffic from production ALB"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = var.backend_port
  to_port                      = var.backend_port
}
