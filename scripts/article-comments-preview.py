"""Local-only preview using the actual sleepy article routes and an isolated DB.

No production credentials, services or AI calls. Started by pnpm dev when the
sibling sleepy checkout exists. Production does not import this module.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
from flask import Flask, request, jsonify

root=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(root.parent/'sleepy'))
from sleepy_app.community.store import CommunityStore, CommunityBurstLimiter, CommunityValidationError
from sleepy_app.community.moderation import ModerationResult
from sleepy_app.community.articles import register_article_comments

class PreviewModerator:
    def moderate(self,**kwargs):
        return ModerationResult('allow','local preview only','preview')

app=Flask(__name__)
store=CommunityStore(str(root/'.cache/article-comments-preview.sqlite3'))
def digest(value):return hashlib.sha256(('local-preview|'+value).encode()).hexdigest()
services={
    'community_store':store,
    'verify_admin_secret':lambda:request.headers.get('X-Admin-Secret')=='local-preview',
    'get_community_owner_hash':lambda r:digest(r.headers.get('X-Community-Identity','')),
    'get_community_actor_hash':digest,
    'get_community_rate_limit_keys':lambda r:(digest(r.remote_addr or ''),digest(r.headers.get('X-Client-ID',''))),
    'community_comment_limiter':CommunityBurstLimiter(30),
    'comment_moderator':PreviewModerator(),
    'community_qq_number':lambda email:None,
    'community_qq_avatar_url':lambda number:'/local-avatar.svg',
    'community_avatar_svg':lambda email:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="#799bb5"/></svg>',
}
register_article_comments(app,services)
def dev_article(ident):
    if not ident.startswith('a_') or not ident.replace('_','').isalnum():
        raise CommunityValidationError('not_found','文章不可用')
    file=root/'.cache/article-comments'/f'{ident}.json'
    try:return json.loads(file.read_text(encoding='utf8'))
    except (OSError,ValueError):raise CommunityValidationError('not_found','请先打开文章，再读取评论')
app.extensions['article_comments'].article=dev_article
@app.get('/local-avatar.svg')
def avatar():
    from flask import Response
    return Response(services['community_avatar_svg'](''),mimetype='image/svg+xml')
@app.get('/health')
def health():return jsonify(preview=True)
# Same poll implementation, isolated database and local-only definition sync.
from types import SimpleNamespace
from sleepy_app.community.polls import register_polls
register_polls(app, SimpleNamespace(community_store=store, common_security=SimpleNamespace(
    get_community_owner_hash=services['get_community_owner_hash'],
    get_community_rate_limit_keys=services['get_community_rate_limit_keys'])),
    SimpleNamespace(article_manifest=root/'.cache/comment-manifest.json'))
_poll_stamp = None
@app.before_request
def sync_preview_polls():
    global _poll_stamp
    if not request.path.startswith('/blog/community/'):
        return
    definition_file=root/'.cache/poll-definitions.json'
    try:
        stamp=definition_file.stat().st_mtime_ns
        if stamp != _poll_stamp:
            app.extensions['article_polls'].sync(json.loads(definition_file.read_text(encoding='utf8')))
            _poll_stamp=stamp
    except (OSError, ValueError) as exc:
        return jsonify(success=False,message='本地投票同步失败：'+str(exc)),400

if __name__=='__main__':
    print('Article comments: LOCAL PREVIEW, isolated DB, no AI calls; admin key: local-preview',flush=True)
    app.run(host='127.0.0.1',port=int(os.environ.get('SLEEPY_ARTICLE_PREVIEW_PORT','9012')),use_reloader=False)
