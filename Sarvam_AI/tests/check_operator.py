"""ponytail: one check that every desk field has operator prompts + tips."""

from identitygraph.operator import audit_missing_prompts, serialize_all_services

gaps = audit_missing_prompts()
assert not gaps, f"missing prompts/tips: {gaps}"

services = serialize_all_services()
assert len(services) >= 13
assert all(len(s["form_fields"]) > 0 for s in services)
assert all(s.get("operator", {}).get("process_summary") is not None for s in services)
print(f"ok: {len(services)} services, {sum(len(s['form_fields']) for s in services)} fields")
