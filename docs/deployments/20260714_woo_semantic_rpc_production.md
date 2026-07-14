# 2026-07-14 Woo Semantic RPC Production Deployment (Phase 2B.1B)

| Field | Value |
| --- | --- |
| UTC execution timestamp | 2026-07-14T19:23:40Z |
| Git HEAD | 52d78def599f3059f8e0ece14db8ce7067fb53c7 |
| Install artifact SHA-256 | d4bb06d3bd1ab1e13f27d8be629f3957d92612c84380da106ae18af89f35f791 |
| Shadow validation artifact SHA-256 | 8a8605be5ff49fb8601fb3c1b4648bdb8284617aae51cd6ca8a55285cedcb75d |
| Verified rollback artifact SHA-256 | f652a0a791138d50a044021faf79073db202514fdcbb2e7298a78b234f7f41df |
| Installation result | PASS (single execution) |
| Shadow validation A–F | PASS (all summary/daily/metadata checks matched) |
| Rollback | Not needed |
| Semantic RPC present | `exec_dashboard.get_woo_metrics_semantic(date,date)` installed |
| Function owner / SECURITY DEFINER / search_path | Owner `postgres`, `SECURITY DEFINER = true`, `SET search_path TO 'public','exec_dashboard'` |
| EXECUTE privileges | `service_role=TRUE`, `anon=FALSE`, `authenticated=FALSE`, `public=FALSE` |
| Post-install schema ACL | `service_role=TRUE`, `anon=TRUE`, `authenticated=TRUE`, `public=FALSE` |
| Legacy hashes (exec/public) | `f8df94b2e39f1750c6c6620f1bef235c5f94909e77b17c5d6459067b3a54a459` / `114423532467e6abea3e1167d7d7068df6fc8292951c1935712174f35f1c23e0` |
| Consumers changed | None |

## Evidence

| Artifact | Path | SHA-256 |
| --- | --- | --- |
| Install log | `/private/tmp/phase2b1b_prod/install.log` | `5a0874bd2c6910e78bdedf392d97f160a2558651ee10f95a00baf52ff835f2b9` |
| Shadow validation log | `/private/tmp/phase2b1b_prod/validation.log` | `7e79296bf62ca374d2c7febbca95fe5851f7ce124aabf7a9b10360340b542497` |
| Post-install privilege + hash checks | `/private/tmp/phase2b1b_prod/post_install_checks.log` | `3fd013f7e862e7458af6c6e9c60b40ee8a38d5238e518722b4ab23495837c36d` |
| Function ownership/search_path confirmation | `/private/tmp/phase2b1b_prod/post_install_owner.log` | `d72dd1241fa4175283b4e558c6812fef60f40e5366714d412ca512332d5411f3` |

Production remained unchanged outside of the semantic RPC installation and validation described above.
