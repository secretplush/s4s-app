#!/bin/bash
# Poll milliexhart's latest chats for new unread messages
API_KEY="ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
MILLIE_ACCT="acct_ebca85077e0a4b7da04cf14176466411"
BASE="https://app.onlyfansapi.com/api"

curl -s "$BASE/$MILLIE_ACCT/chats?limit=10&order=recent" \
  -H "Authorization: Bearer $API_KEY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
chats = data if isinstance(data, list) else data.get('data', [])
for c in chats:
    unread = c.get('unreadMessagesCount', 0)
    fan = c.get('fan', c.get('withUser', {}))
    fan_id = fan.get('id', '?')
    fan_name = fan.get('name', fan.get('username', '?'))
    last_msg = c.get('lastMessage', {})
    msg_text = last_msg.get('text', '')
    from_user = last_msg.get('fromUser', {})
    from_id = from_user.get('id', '?')
    # Only show if unread and message is FROM the fan (not from millie)
    if unread > 0 and from_id != 544695119:
        print(f'UNREAD | fan_id={fan_id} | name={fan_name} | unread={unread} | last_msg={msg_text[:100]}')
"
