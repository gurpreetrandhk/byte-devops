output "db_host" {
  description = "Private PostgreSQL hostname for the Flask application."
  value       = module.rds.db_instance_address
}

output "db_port" {
  value = 5432
}

output "db_name" {
  value = "devopsdb"
}

output "db_username" {
  value = "postgres"
}

output "security_group_id" {
  value = aws_security_group.rds.id
}
