#!/bin/sh
set -eu

cp /run/secrets/languon-admin-htpasswd /etc/nginx/admin/htpasswd
chown nginx:nginx /etc/nginx/admin
chmod 0500 /etc/nginx/admin
chown nginx:nginx /etc/nginx/admin/htpasswd
chmod 0400 /etc/nginx/admin/htpasswd

exec nginx -g 'daemon off;'
