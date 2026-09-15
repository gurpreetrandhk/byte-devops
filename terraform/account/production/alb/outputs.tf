output "alb_dns_name" {
  value = module.alb.dns_name
}

output "alb_arn" {
  value = module.alb.arn
}

output "alb_zone_id" {
  value = module.alb.zone_id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "target_group_arn" {
  value = module.alb.target_groups["app"].arn
}
