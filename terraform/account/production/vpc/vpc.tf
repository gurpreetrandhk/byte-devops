locals {
  azs      = var.azs
  vpc_cidr = var.vpc_cidr
}





module "vpc" {
  source = "../../../modules/vpc"


  tags = merge(
    local.common_tags,
    { Account = local.account, Environment = local.environment },
  )

  # VPC
  name = "supernova-vpc"
  cidr = local.vpc_cidr

  # Availability Zones
  azs = local.azs

  # 2 Public Subnets
  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets
  # Dedicated NACLs; the module associates them with each subnet group.
  public_dedicated_network_acl  = true
  private_dedicated_network_acl = true

  public_inbound_acl_rules   = local.nacl_access
  public_outbound_acl_rules  = local.nacl_access
  private_inbound_acl_rules  = local.nacl_access
  private_outbound_acl_rules = local.nacl_access

  public_acl_tags  = { Name = "proxy-vpc-public-nacl" }
  private_acl_tags = { Name = "proxy-vpc-private-nacl" }

  # enable the internet gateway
  create_igw = true

  # NAT Gateway
  enable_nat_gateway = true
  single_nat_gateway = true

  # DNS
  enable_dns_hostnames = true
  enable_dns_support   = true



}
