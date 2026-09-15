module "rds" {
  source = "../../../modules/rds"

  # RDS identifiers must begin with a letter.
  identifier = "byte-postgres"
  engine     = "postgres"
  # AWS selects its default PostgreSQL version at creation.
  create_db_parameter_group = false
  create_db_option_group    = false
  engine_lifecycle_support  = "open-source-rds-extended-support-disabled"

  instance_class        = var.instance_class
  allocated_storage     = 20
  max_allocated_storage = 0
  storage_type          = "gp2"
  storage_encrypted     = true
  multi_az              = false
  publicly_accessible   = false

  db_name                     = "devopsdb"
  username                    = "postgres"
  port                        = 5432
  manage_master_user_password = false
  password_wo                 = var.db_password
  password_wo_version         = var.password_version

  create_db_subnet_group = true
  subnet_ids             = sort(data.aws_subnets.private.ids)
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 1
  skip_final_snapshot     = false
  deletion_protection     = true
  monitoring_interval     = 0

  tags = {
    Name        = "byte-postgres"
    Environment = "production"
    ManagedBy   = "Terraform"
  }
}
