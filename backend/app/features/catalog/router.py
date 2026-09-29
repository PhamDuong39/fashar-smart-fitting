from fastapi import APIRouter

from app.features.catalog.data import PRODUCTS

router = APIRouter()


@router.get("/api/catalog")
def catalog():
    return {"products": PRODUCTS}
