module "server-01" {
  source                      = "../../../modules/ec2-instance"
  name                        = var.name
  ami                         = var.ami
  instance_type               = var.instance_type
  key_name                    = var.pem_key
  subnet_id                   = data.aws_subnet.server.id
  associate_public_ip_address = false
  create_security_group       = false
  vpc_security_group_ids      = [aws_security_group.server.id]
  root_block_device = {
    type       = "gp3"
    throughput = 125
    size       = 30
    encrypted  = true
  }
  tags = var.common_tags
}



####################################server 2##################
module "server-02" {
  source                      = "../../../modules/ec2-instance"
  name                        = "supernova-server-02"
  ami                         = var.ami
  instance_type               = var.instance_type
  key_name                    = var.pem_key
  subnet_id                   = data.aws_subnet.server.id
  associate_public_ip_address = false
  create_security_group       = false
  vpc_security_group_ids      = [aws_security_group.server.id]
  root_block_device = {
    type       = "gp3"
    throughput = 125
    size       = 30
    encrypted  = true
  }
  tags = var.common_tags
}
########################public-server##########################
module "server-public" {
  source                      = "../../../modules/ec2-instance"
  name                        = "supernova-server-public"
  ami                         = var.ami
  instance_type               = var.instance_type
  key_name                    = var.pem_key
  subnet_id                   = data.aws_subnet.server.id
  associate_public_ip_address = true
  create_security_group       = false
  vpc_security_group_ids      = [aws_security_group.server.id]
  root_block_device = {
    type       = "gp3"
    throughput = 125
    size       = 30
    encrypted  = true
  }
  tags = var.common_tags
}
