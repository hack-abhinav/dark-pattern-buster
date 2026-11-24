"""AWS Lambda entry point: API Gateway events → the FastAPI app."""

from mangum import Mangum

from .main import app

handler = Mangum(app, lifespan="off")
