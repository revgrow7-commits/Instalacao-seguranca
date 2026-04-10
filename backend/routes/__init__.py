"""
Routes package initialization.
"""
from fastapi import APIRouter

# Import all routers
from routes.auth_new import router as auth_router  # Updated to use new auth system
from routes.users import router as users_router
from routes.jobs import router as jobs_router
from routes.checkins import router as checkins_router
from routes.item_checkins import router as item_checkins_router
from routes.products import router as products_router
from routes.reports import router as reports_router
from routes.calendar import router as calendar_router
from routes.notifications import router as notifications_router
from routes.gamification import router as gamification_router
from routes.installers import router as installers_router


def include_all_routers(api_router: APIRouter):
    """Include all sub-routers in the main API router."""
    api_router.include_router(auth_router, tags=["Auth"])
    api_router.include_router(users_router, tags=["Users"])
    api_router.include_router(jobs_router, tags=["Jobs"])
    api_router.include_router(checkins_router, tags=["Check-ins"])
    api_router.include_router(item_checkins_router, tags=["Item Check-ins"])
    api_router.include_router(products_router, tags=["Products"])
    api_router.include_router(reports_router, tags=["Reports"])
    api_router.include_router(calendar_router, tags=["Calendar"])
    api_router.include_router(notifications_router, tags=["Notifications"])
    api_router.include_router(gamification_router, tags=["Gamification"])
    api_router.include_router(installers_router, tags=["Installers"])
