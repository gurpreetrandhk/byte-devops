# Private RDS PostgreSQL

Uses ../../../modules/rds and the existing supernova-vpc private subnets in
ap-south-1. Apply the VPC and EC2 stacks first. Override vpc_name and
ec2_security_group_name if the deployed Name tags differ.

The identifier is byte-postgres because AWS requires a letter first.
Creates devopsdb; the Flask application/migrations must create the users table.
The EC2 security group alone can connect on TCP 5432.

From this directory in WSL, using Terraform >= 1.11.1:

```bash
terraform init
terraform validate
read -rsp 'PostgreSQL master password: ' TF_VAR_db_password
export TF_VAR_db_password
printf '\n'
terraform plan -out=rds.tfplan
terraform apply rds.tfplan
unset TF_VAR_db_password
terraform output
```

The password uses the module's ephemeral write-only input. Keep it available
for both plan and apply. Increment password_version when rotating it.
Use the db_host output and port 5432 from EC2, with database devopsdb and
username postgres. Enable SSL in the PostgreSQL connection.

20 GiB gp2, db.t4g.micro, Single-AZ, encrypted, no public access.
Free Tier eligibility depends on your AWS account; this does not guarantee zero cost.
Deletion protection is enabled and deletion takes a final snapshot. To tear down,
set deletion_protection to false, apply that change, then run terraform destroy.
Final snapshots persist and can incur storage charges.
