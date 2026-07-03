# PythonAnywhere WSGI entry point
# Point your PA web app's WSGI file to this

import sys
import os

# Add your project path
project_home = '/home/YOURUSERNAME/cashflow/backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Load .env if present
from dotenv import load_dotenv
load_dotenv(os.path.join(project_home, '.env'))

from app.main import app as application
