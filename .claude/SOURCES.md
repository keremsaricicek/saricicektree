# Proje skill ve agent kaynakları

Yalnızca istenen öğeler kopyalandı; koleksiyonların tamamı etkinleştirilmedi. Dosyalar değiştirilmedi.
Kurulum yeri: `.claude/skills/<ad>/SKILL.md` ve `.claude/agents/<ad>.md` (Claude Code'un proje düzeyi konumları).

| Öğe | Kaynak (commit, tarih) | Lisans |
|---|---|---|
| frontend-design, webapp-testing | anthropics/skills `3337550` (2026-09-24) | Apache-2.0 (her klasörde LICENSE.txt) |
| agents: code-reviewer, silent-failure-hunter, pr-test-analyzer | anthropics/claude-plugins-official `fa59bc9` (2026-09-25), plugins/pr-review-toolkit | Apache-2.0 (`agents/LICENSE-pr-review-toolkit`) |
| differential-review | trailofbits/skills `0cc1c73` (2026-09-24) | CC BY-SA 4.0 (klasörde LICENSE) |
| systematic-debugging, verification-before-completion | obra/superpowers `8ca22db` (2026-09-25) | MIT (klasörlerde LICENSE) |
| capacitor-testing, capacitor-security, capacitor-accessibility, capacitor-performance, capacitor-keyboard, safe-area-handling, capacitor-push-notifications, capacitor-deep-linking, capacitor-ci-cd, capacitor-app-store | Cap-go/capgo-skills `c0afb73` (2026-07-13) | MIT (package.json) |

Uyumluluk notları
- Capgo skill'leri sürümden bağımsız Capacitor API'lerini anlatır; bu proje Capacitor 7 kullanır. Skill önerileri ana sürüm yükseltmesi gerekçesi sayılmaz.
- webapp-testing Python Playwright örnekleri içerir; bu projede testler Node Playwright ile yazılır, skill yalnızca yöntem kılavuzu olarak kullanılır.
- Hiçbir skill ücretli hizmet veya hesap gerektirecek şekilde kullanılmaz.
