web: gunicorn acfe_shop.wsgi:application --bind 0.0.0.0:$PORT --workers 2 --timeout 120
release: python manage.py migrate && python manage.py bootstrap_demo
