module "alb" {
  source = "../../../modules/alb"

  name                       = var.name
  load_balancer_type         = "application"
  internal                   = var.internal
  vpc_id                     = var.vpc_id
  subnets                    = var.subnet_ids
  create_security_group      = false
  security_groups            = [aws_security_group.alb.id]
  enable_deletion_protection = true
  drop_invalid_header_fields = true

  #  access_logs = var.access_logs_bucket == null ? null : {
  #    bucket  = var.access_logs_bucket
  #    enabled = false
  #    prefix  = var.name
  #  }

  listeners = {
    http = {
      port     = 80
      protocol = "HTTP"
      forward = {
        target_group_key = "app"
      }
    }
  }

  target_groups = {
    app = {
      name        = "supernova-tg"
      protocol    = "HTTP"
      port        = var.backend_port
      target_type = "instance"
      # Register instances manually in this target group.
      create_attachment = false
      health_check = {
        enabled             = true
        path                = var.health_check_path
        port                = "traffic-port"
        protocol            = "HTTP"
        matcher             = "200"
        interval            = 30
        timeout             = 5
        healthy_threshold   = 3
        unhealthy_threshold = 3
      }
    }
  }
}

