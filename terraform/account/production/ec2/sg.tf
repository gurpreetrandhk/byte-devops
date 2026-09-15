data "aws_subnet" "server" {
  filter {
    name   = "tag:Name"
    values = [var.subnet_name]
  }

}
resource "aws_security_group" "server" {
  name_prefix = "${var.name}-"
  description = "Production server security group"
  vpc_id      = data.aws_subnet.server.vpc_id
  tags        = merge(var.common_tags, { Name = "${var.name}-sg" })
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "server" {
  security_group_id = aws_security_group.server.id
  description       = "Outbound IPv4 traffic"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each          = var.ssh_allowed_ipv4_cidrs
  security_group_id = aws_security_group.server.id
  description       = "SSH from trusted networks"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
}
