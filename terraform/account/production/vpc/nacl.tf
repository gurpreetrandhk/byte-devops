# Baseline IPv4 rules: preserve existing allow-all traffic behavior.
# Network ACLs are stateless; restrictive rules must allow return traffic.
locals {
  nacl_access = [
    {
      rule_number = 100
      rule_action = "allow"
      protocol    = "-1"
      from_port   = 0
      to_port     = 0
      cidr_block  = "0.0.0.0/0"
    }
  ]
}
