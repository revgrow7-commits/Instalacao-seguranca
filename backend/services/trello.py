"""
Trello Integration Service
Connects to Trello API to fetch PCP (Production Control) data
"""
import os
import logging
import requests
from typing import List, Dict, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Trello API Configuration
TRELLO_API_KEY = os.environ.get('TRELLO_API_KEY')
TRELLO_TOKEN = os.environ.get('TRELLO_TOKEN')
TRELLO_BOARD_ID = os.environ.get('TRELLO_BOARD_ID')
TRELLO_BASE_URL = "https://api.trello.com/1"


def get_auth_params() -> Dict:
    """Get authentication parameters for Trello API"""
    return {
        "key": TRELLO_API_KEY,
        "token": TRELLO_TOKEN
    }


async def get_board_info() -> Dict:
    """Get board information"""
    try:
        response = requests.get(
            f"{TRELLO_BASE_URL}/boards/{TRELLO_BOARD_ID}",
            params=get_auth_params(),
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error fetching board info: {e}")
        raise


async def get_board_lists() -> List[Dict]:
    """Get all lists from the board"""
    try:
        response = requests.get(
            f"{TRELLO_BASE_URL}/boards/{TRELLO_BOARD_ID}/lists",
            params=get_auth_params(),
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error fetching lists: {e}")
        raise


async def get_board_cards(list_id: Optional[str] = None) -> List[Dict]:
    """Get cards from the board, optionally filtered by list"""
    try:
        params = {
            **get_auth_params(),
            "fields": "name,idList,due,dueComplete,labels,desc,dateLastActivity,shortUrl",
            "members": "true",
            "member_fields": "fullName,username"
        }
        
        if list_id:
            url = f"{TRELLO_BASE_URL}/lists/{list_id}/cards"
        else:
            url = f"{TRELLO_BASE_URL}/boards/{TRELLO_BOARD_ID}/cards"
        
        response = requests.get(url, params=params, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error fetching cards: {e}")
        raise


async def get_card_details(card_id: str) -> Dict:
    """Get detailed information about a specific card"""
    try:
        params = {
            **get_auth_params(),
            "fields": "all",
            "members": "true",
            "member_fields": "fullName,username",
            "checklists": "all",
            "attachments": "true",
            "attachment_fields": "name,url,date"
        }
        
        response = requests.get(
            f"{TRELLO_BASE_URL}/cards/{card_id}",
            params=params,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error fetching card details: {e}")
        raise


async def get_installation_cards() -> List[Dict]:
    """Get cards from the 'TIME DE INSTALAÇÃO' list"""
    try:
        # First get all lists to find the installation list
        lists = await get_board_lists()
        installation_list = None
        
        for lst in lists:
            if 'INSTALAÇÃO' in lst.get('name', '').upper():
                installation_list = lst
                break
        
        if not installation_list:
            logger.warning("Installation list not found")
            return []
        
        # Get cards from the installation list
        cards = await get_board_cards(installation_list['id'])
        return cards
    except Exception as e:
        logger.error(f"Error fetching installation cards: {e}")
        raise


async def get_pcp_summary() -> Dict:
    """Get a summary of the PCP board"""
    try:
        lists = await get_board_lists()
        cards = await get_board_cards()
        
        # Build summary
        summary = {
            "board_name": "PCP - Industria Visual",
            "total_cards": len(cards),
            "lists": []
        }
        
        # Group cards by list
        list_names = {lst['id']: lst['name'] for lst in lists}
        cards_by_list = {}
        
        for card in cards:
            list_id = card.get('idList')
            if list_id not in cards_by_list:
                cards_by_list[list_id] = []
            cards_by_list[list_id].append(card)
        
        # Build list summaries
        for lst in lists:
            list_cards = cards_by_list.get(lst['id'], [])
            
            # Count cards with due dates
            cards_with_due = [c for c in list_cards if c.get('due')]
            overdue_cards = [c for c in cards_with_due if c.get('due') and not c.get('dueComplete') and datetime.fromisoformat(c['due'].replace('Z', '+00:00')) < datetime.now(timezone.utc)]
            
            summary['lists'].append({
                "id": lst['id'],
                "name": lst['name'],
                "total_cards": len(list_cards),
                "cards_with_due": len(cards_with_due),
                "overdue_cards": len(overdue_cards)
            })
        
        return summary
    except Exception as e:
        logger.error(f"Error fetching PCP summary: {e}")
        raise


async def search_cards(query: str) -> List[Dict]:
    """Search for cards by name or description"""
    try:
        cards = await get_board_cards()
        query_lower = query.lower()
        
        matching_cards = []
        for card in cards:
            name = card.get('name', '').lower()
            desc = card.get('desc', '').lower()
            
            if query_lower in name or query_lower in desc:
                matching_cards.append(card)
        
        return matching_cards
    except Exception as e:
        logger.error(f"Error searching cards: {e}")
        raise


async def get_cards_by_date_range(start_date: str, end_date: str) -> List[Dict]:
    """Get cards with due dates within a specific range"""
    try:
        cards = await get_board_cards()
        
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        
        filtered_cards = []
        for card in cards:
            if card.get('due'):
                due = datetime.fromisoformat(card['due'].replace('Z', '+00:00'))
                if start <= due <= end:
                    filtered_cards.append(card)
        
        return filtered_cards
    except Exception as e:
        logger.error(f"Error filtering cards by date: {e}")
        raise
