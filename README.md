# skills

Skills para agentes que implementan una forma de entregar software con agentes de código: planificar en el tracker, implementar en worktrees aislados, probar cada cambio con la salida real de los gates y dejar a una persona en cada merge hacia la rama base. Las skills no dependen de ningún proyecto: `setup-workflow` escribe lo propio de cada repo en unos pocos archivos que las skills leen al ejecutarse.

## El flujo de trabajo

**Features grandes: spec → mapa de tickets → workers en paralelo → rama de integración.**

1. Una spec llega al tracker (`to-spec`) y las decisiones quedan en la documentación del repo (`grill-with-docs`, `domain-modeling`).
2. `create-tickets` la divide en un mapa de tickets: IDs estables (`M2-B1-T03`), criterios de aceptación, ownership y relaciones de bloqueo nativas.
3. `implement-tickets` ejecuta cada ola de dependencias con workers, cada uno en su propio worktree. Cada PR de ticket apunta a una rama de integración, lo revisa el agente principal y se mergea solo cuando la suite completa pasa sobre el candidato exacto de merge.
4. El PR de integración hacia la rama base queda en borrador hasta que una persona lo mergea.

**Fixes puntuales: issue → worktree → fix con test primero → PR.**

1. Un issue, un worktree, una rama.
2. `diagnosing-bugs` hasta que el ciclo quede en rojo, y después `tdd` para el cambio más chico que lo ponga en verde.
3. `verify` antes del PR; su bloque `GATE`/`VERDICT` va en el cuerpo del PR.
4. Los hallazgos de una revisión de un PR ya mergeado se resuelven en PRs de seguimiento, no con enmiendas.

## Skills

| Skill | Qué hace |
| --- | --- |
| [`setup-workflow`](skills/setup-workflow/SKILL.md) | Configura un repo: harness, tracker, labels, documentación de dominio, convenciones y gates de verify. Instala todo lo de abajo. Se ejecuta a mano (`/setup-workflow`). |
| [`create-tickets`](skills/create-tickets/SKILL.md) | Convierte un plan aprobado en un mapa de tickets con dependencias, en Linear, GitHub Issues o markdown local. |
| [`implement-tickets`](skills/implement-tickets/SKILL.md) | Implementa un mapa de tickets con workers en worktrees paralelos, revisión del agente principal y gates de merge con la suite completa. |
| [`verify`](skills/verify/SKILL.md) | Mapea el diff a los gates obligatorios del repo, los ejecuta e imprime un veredicto en el que un revisor puede confiar. |
| [`review-diff`](skills/review-diff/SKILL.md) | Revisa un diff, una rama o un PR en dos ejes separados, estándares y spec, con subagentes en paralelo. `implement-tickets` lo corre en cada PR de ticket y sobre la rama de feature terminada. Adaptado de `code-review` de Matt Pocock. |
| [`grilling`](skills/grilling/SKILL.md) | Te entrevista sobre un plan en rondas, recorriendo un árbol de diseño, con una respuesta recomendada para cada pregunta. De Matt Pocock. |
| [`grill-with-docs`](skills/grill-with-docs/SKILL.md) | Grilling más `domain-modeling`: los términos del glosario y los ADRs se escriben a medida que la entrevista los resuelve. Se ejecuta a mano. De Matt Pocock. |
| [`domain-modeling`](skills/domain-modeling/SKILL.md) | Cuestiona y precisa el lenguaje del dominio, y registra términos del glosario y ADRs. Adaptado de Matt Pocock a la estructura multi-contexto de abajo. |

`setup-workflow` también instala estas skills de upstream, fijadas en el `skills-lock.json` del repo destino: `tdd`, `diagnosing-bugs`, `codebase-design`, `improve-codebase-architecture`, `prototype`, `writing-for-agents`, `handoff`, `to-spec`, `triage`, `research`, `retro`, `to-questionnaire` y `wizard` de [mattpocock/skills](https://github.com/mattpocock/skills), más `react-useeffect` de [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) en repos con React. [`upstream.json`](skills/setup-workflow/upstream.json) las lista, junto con las skills de upstream que quedaron afuera y el motivo.

## Instalación

En el repo que se quiere configurar:

```bash
npx skills add tymkiwdylan/skills -s setup-workflow -a claude-code codex -y
```

Después, ejecutar `/setup-workflow` en el agente. Explora el repo, propone una respuesta para cada decisión, muestra cada archivo antes de escribirlo, instala el resto de las skills y termina corriendo `verify --plan` contra el historial reciente para que se puedan revisar los gates.

Para actualizar más adelante: `npx skills update -p`. El resto del equipo restaura el conjunto fijado con `npx skills experimental_install`.

## Qué escribe el setup

| Archivo | Contenido |
| --- | --- |
| `docs/agents/issue-tracker.md` | Dónde viven los issues y las operaciones exactas de ese tracker |
| `docs/agents/triage-labels.md` | El label o estado que corresponde a cada rol de triage y a cada clasificación de ticket |
| `docs/agents/domain.md` | La estructura del glosario y de los ADRs |
| `docs/agents/workflow.md` | Harness, idioma, ramas, commits, reglas de PR, estrategia de merge, comandos de la suite completa y notificaciones |
| `.agents/config/verify.json` | Gates (rutas cambiadas → comando) y reglas sobre líneas agregadas para `verify` |
| `GLOSSARY.md` + `docs/adr/` (un solo contexto), o `GLOSSARY-MAP.md` + `docs/domains/<contexto>/GLOSSARY.md` + `docs/adr/` (multi-contexto) | El lenguaje del dominio y las decisiones registradas. El setup puede sembrar los primeros términos y ADRs a partir del código, con confirmación de cada uno. |
| `## Agent skills` en `CLAUDE.md` o `AGENTS.md` | Referencias a todo lo anterior |

Los archivos `issue-tracker.md`, `triage-labels.md` y `domain.md` tienen la misma forma que los de `setup-matt-pocock-skills`, así que las skills de upstream los leen sin cambios.

## Documentación de dominio

Toda skill que nombra un concepto del dominio usa el término del glosario dueño de ese concepto, y señala cualquier resultado que contradiga un ADR. En un repo multi-contexto, el punto de entrada es `GLOSSARY-MAP.md`:

| Contexto | Glosario | Es dueño de (rutas principales) | ADRs |
| --- | --- | --- | --- |
| Billing | `docs/domains/billing/GLOSSARY.md` | `apps/api/billing/`, `packages/invoicing/` | 0002, 0004 |

Un agente va de un archivo cambiado a su contexto, y lee ese glosario y esos ADRs antes de tocar el código. Cada término pertenece a un solo contexto, y todos los ADRs comparten una única numeración, verificada contra la rama base para que ramas en paralelo no repitan números.

## Harness

`workflow.md` indica el harness, y `implement-tickets` se adapta:

- **`t3code`**: T3 Code sobre Claude Code. Los workers son subagentes en worktrees, los PRs quedan vinculados al thread y el thread espera con `watch_pull_request` en lugar de hacer polling.
- **`plain`**: cualquier otro harness. Los workers trabajan en checkouts de `git worktree`, y el CI se sigue con `gh pr checks --watch`.

## Próximos pasos

- `live-qa`: QA en el navegador de un cambio en la app corriendo, con chequeo previo del entorno, adaptadores de login y un reporte de defectos.
- `autofix`: un carril desatendido que lleva un bug etiquetado hasta un PR revisado o lo devuelve a una persona.
- Plantillas de runners para programar esos carriles.

## Desarrollo

```bash
npm test
```

Corre los tests del motor de `verify` y los chequeos del repo en [`test/repo.test.mjs`](test/repo.test.mjs): frontmatter, links, validez de las plantillas, colisiones con upstream, la lista de instalación y una protección contra nombres propios de un proyecto.

## Créditos

`grilling`, `grill-with-docs`, `domain-modeling` y `review-diff` (a partir de `code-review`) están incluidas desde [mattpocock/skills](https://github.com/mattpocock/skills) de Matt Pocock (MIT), y la forma de los archivos de `docs/agents/` sigue su `setup-matt-pocock-skills`. [NOTICE.md](NOTICE.md) registra el commit de upstream y cada cambio hecho acá. La mayoría de las skills de upstream que instala `setup-workflow` también son suyas.

## Licencia

[MIT](LICENSE). Las skills incluidas desde upstream conservan su licencia original en sus propias carpetas.
