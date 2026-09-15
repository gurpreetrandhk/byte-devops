output "instance_id" {
  value = module.server-01.id
}
output "private_ip" {
  value = module.server-01.private_ip
}
output "public_ip" {
  value = module.server-01.public_ip
}
output "security_group_id" {
  description = "Server security group ID for the ALB configuration."
  value       = aws_security_group.server.id
}

output "server_name" {
  value = var.name
}

output "instance_ids" {
  description = "Private application instance IDs for the ALB instance_ids input."
  value       = [module.server-01.id, module.server-02.id]
}

output "public_server_public_ip" {
  description = "Public IPv4 address of the public server."
  value       = module.server-public.public_ip
}
