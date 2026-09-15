locals {
  account     = "supernova"
  environment = "prod-stg"

  # 2 Public Subnets
  public_subnets = [
    "10.0.1.0/24",
    "10.0.2.0/24"
  ]

  # 2 Private Subnets
  private_subnets = [
    "10.0.11.0/24",
    "10.0.12.0/24"
  ]


  common_tags = {
    Environment = "prod-stg"
    ManagedBy   = "Terraform"
  }
}