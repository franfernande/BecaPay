# BecaPay

**Becas programables en Celo.** BecaPay es un agente autónomo que paga a cada estudiante un monto fijo en su propia moneda local (wFIAT de Ripio: wCOP, wBRL, wARS, wMXN), protege el efectivo ocioso de la fundación en USD₮ y deja cada pago auditable en Celoscan sin exponer datos personales.

Hecho para el hackathon **Agents on Open Rails**. Pista 1 (Stable Agents, Ripio × Celo) y pista 2A (Textile).

> Versión en inglés: [README.md](README.md). Este archivo es la traducción de ese documento y debe decir lo mismo.

## Cómo ejecutarlo

No hace falta API key, billetera ni `.env.local`. El modo demo es el predeterminado: cualquier valor distinto de `DRY_RUN=false` deja al agente en simulación. Arranca, puede cargar becarios de ejemplo y no firma ni envía transacciones.

```bash
npm install
npm run dev
```

Abrí http://localhost:4317 (puerto **4317**). En el panel hacé clic en **Cargar demo** y después en **Correr ciclo**. Alcanza con Node.js 20 o superior.

| | |
|---|---|
| Arranque | `npm run dev` |
| Puerto | `4317` |
| Variables de entorno obligatorias | ninguna para la demo |
| Modo demo / simulación | `DRY_RUN` viene activado. Solo el valor literal `false` envía una transacción real en Celo. |
| Tests | `npm test` — chequeos sin red ni secretos |
| Demo en vivo | https://becapay.vercel.app |

Las notas más largas, incluido cómo pasar a modo en vivo, están en [Correrlo](#correrlo).

## En Celo mainnet

Chain id **42220**. Estos son contratos que ya existen de Ripio y de Celo; este repo no los despliega. Los links del explorador están en [Celoscan](https://celoscan.io).

| Qué | Dirección |
|---|---|
| Billetera del agente | [`0xDf0c8840FCc58A7554Bda12ed8A657c74B078C9c`](https://celoscan.io/address/0xDf0c8840FCc58A7554Bda12ed8A657c74B078C9c) |
| USD₮ | [`0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e`](https://celoscan.io/token/0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e) |
| wCOP | [`0x8a1d45e102e886510e891d2ec656a708991e2d76`](https://celoscan.io/token/0x8a1d45e102e886510e891d2ec656a708991e2d76) |
| wBRL | [`0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0`](https://celoscan.io/token/0xd76f5faf6888e24d9f04bf92a0c8b921fe4390e0) |
| wARS | [`0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d`](https://celoscan.io/token/0x0dc4f92879b7670e5f4e4e6e3c801d229129d90d) |
| wMXN | [`0x337e7456b420bd3481e7fa61fa9850343d610d34`](https://celoscan.io/token/0x337e7456b420bd3481e7fa61fa9850343d610d34) |
| Registro de identidad ERC-8004 | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://celoscan.io/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |

En este repo todavía no hay un hash de transacción de ejemplo. El modo por defecto no envía transacciones. Después de un ciclo en vivo, cada hash aparece en `/auditoria` y en Celoscan.

---

## El problema

Las fundaciones de América Latina fondean becas en dólares o en pesos, pero los estudiantes viven en pesos, reales o soles. Cada mes alguien convierte el dinero a mano, paga comisiones bancarias y discute con los donantes adónde fue el dinero. Mientras tanto, los saldos ociosos en pesos pierden valor por la inflación (sobre todo wARS).

## Qué hace el agente

En cada ciclo (mensual, quincenal o semanal), según su propia agenda:

1. **El día antes del pago:** lee la liquidez publicada por Textile (`GET /v2/rfq/levels`) para cada moneda en la que paga el programa y la clasifica como *ok / fragile / no_quote / no_corridor*. Opcionalmente preconvierte el buffer en moneda local.
2. **El día de pago:**
   - paga desde el saldo en moneda local cuando alcanza;
   - si no, pide a Textile una cotización por becario por exactamente el faltante (USD₮ → wFIAT, `exact buy`), parte la orden en pedidos más chicos cuando uno no entra en la profundidad publicada, y rechaza cotizaciones peores que `MAX_SLIPPAGE_BPS` respecto del precio de referencia;
   - si Textile responde `no_quote` (o el corredor no existe), paga el **mismo valor en USD₮** al precio de mercado, marca el pago como `fallback` (nunca como "pagado en moneda local") y avisa a la fundación.
3. **Después de pagar:** si la cobertura en USD₮ está activada, deja solo un ciclo de buffer en moneda local para los becarios cubiertos y convierte el resto a USD₮ (con un lote de cobertura para el seguimiento de ganancias y pérdidas). La cobertura se puede anular por becario.
4. **Salud de la caja:** calcula la autonomía en ciclos. Por debajo del umbral del programa genera una alerta de *cobertura baja* con un link a **Ripio Ramp** ya armado para recargar.
5. **Explica todo:** cada decisión entra en una bitácora en español, con links a las transacciones.

La fundación decide a quién se le paga y cuánto; el agente solo ejecuta.

## Pantallas

| Ruta | Quién | Qué |
|---|---|---|
| `/` | Fundación | Panel: caja (composición por moneda), próximo pago, pagado hasta hoy, salud de la caja (autonomía), alertas con Ripio Ramp, becarios con estado de liquidez, último ciclo, interruptor de cobertura en USD₮ con resultado, volumen en Textile, decisiones recientes, saldo on-chain real de la billetera del agente. Botón "Correr ciclo". |
| `/programa` | Fundación | Becarios (alta, edición, pausa, cobertura por becario), fondeo (depósitos simulados o fondeo on-chain + links a Ripio Ramp), reglas del programa. |
| `/liquidez` | Fundación | Corredores de Textile wFIAT ↔ USD₮ con profundidad y tasas, necesidad por moneda para el próximo ciclo, probador de cotizaciones en vivo (`POST /v2/rfq/preview`), estadísticas de actividad en Textile. |
| `/bitacora` | Fundación | Bitácora completa, filtrable por ciclo. |
| `/auditoria` | **Pública** | Cada pago y cada cambio con links a Celoscan, totales por moneda, identidad del agente. Los becarios aparecen solo como ids opacos (`B-XXXXXX`). Exportación JSON en `/api/public/audit`. |
| `/becario/[id]` | **Pública** (becario) | Vista del propio becario: próximo pago, historial con links a transacciones, explicación cuando se pagó en USD₮, link de off-ramp de Ripio. No se muestra el nombre. |
| `/identidad` | Fundación | Lista de cumplimiento (chain 42220, etiqueta ERC-8021, clave ↔ billetera, gas, ERC-8004, DRY_RUN), JSON de registro, botón de registrar. |

## Reglas del hackathon: cómo se cumple cada una

| Regla | Cómo la cumple BecaPay |
|---|---|
| **Celo mainnet (chain id 42220)** | Usa la chain `celo` de viem y `https://forno.celo.org`. Antes de cualquier ciclo en vivo el agente comprueba `eth_chainId === 42220` y se niega si no coincide. La página `/identidad` muestra esa comprobación en vivo. |
| **wFIAT real** | Direcciones en mainnet de Ripio: wCOP, wBRL, wARS, wMXN, wPEN y wCLP (`src/lib/tokens.ts`). Los pagos son `transfer` ERC-20 de esos tokens. wPEN y wCLP no tienen corredor en Textile hoy, así que la interfaz no los deja elegir como moneda de pago. |
| **Atribución ERC-8021 en cada transacción** | El **único** cliente que firma en la app se crea en `src/lib/celo/clients.ts` como `createWalletClient(...).extend(withAttribution(tag))` de [`@celo/attribution-tags`](https://github.com/celo-org/attribution-tags). Se niega a existir sin un `ATTRIBUTION_TAG` válido. Pagos, aprobaciones, cambios en Textile y el registro ERC-8004 pasan por él. Después de cada envío en vivo el agente relee la transacción y verifica la etiqueta con `verifyTx`. En simulación, arma el calldata exacto y agrega o verifica el sufijo con `toDataSuffix`/`fromDataSuffix` (queda anotado como "+31 bytes, verified"). |
| **Identidad de agente ERC-8004** | `npm run register:8004` (o el botón en `/identidad`) llama a `register(agentURI)` en el Identity Registry de Celo `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` desde la billetera del agente, con la etiqueta de atribución. El archivo de registro sigue `registration-v1` y se sirve en `/api/agent/registration`. |
| **Textile (pista 2A)** | Niveles para el pre-chequeo, `preview` para la simulación, RFQ en firme (`/v2/rfq/request`) con prueba EIP-712 *Textile Taker Control*, aprobación exacta al reactor (si hace falta, primero se vuelve a 0), control de `expiresAt`, transacción de swap y `POST /v2/rfq/{id}/submit`. Las cotizaciones son todo o nada: parte las órdenes, y ante `no_quote` paga en USD₮. Lleva el volumen cotizado frente al ejecutado, las comisiones, la cantidad de `no_quote` y el resultado a mercado de la cobertura. |
| **Ripio Ramp** | Las alertas de cobertura baja y la pestaña de fondeo enlazan a `ramp.ripio.com` con país, chain 42220, token y la billetera del agente ya completos. Los becarios reciben un link de off-ramp. |

## Diseño de seguridad

- **`DRY_RUN=true` por defecto.** Cualquier cosa que no sea el literal `false` mantiene al agente en simulación. En simulación usa **cotizaciones preview reales de Textile** y una caja simulada, arma el calldata con la etiqueta y no firma nada.
- **El modo en vivo exige todo esto:** `DRY_RUN=false`, un `ATTRIBUTION_TAG` válido, una `AGENT_PRIVATE_KEY` que coincida con `AGENT_WALLET_ADDRESS`, y que el RPC informe la chain 42220. La lista de `/identidad` muestra lo que falta.
- **Límites:** `MAX_USDT_PER_CYCLE` topea los USD₮ gastados por ciclo; `MAX_SLIPPAGE_BPS` rechaza malas cotizaciones; las aprobaciones son exactas (nunca ilimitadas); los becarios de demo nunca se pagan en modo en vivo.
- **Los secretos** viven solo en `.env.local` (ignorado por git). La app nunca imprime la clave privada ni la etiqueta de atribución; la interfaz solo dice "configurado / falta".
- **Concurrencia:** cada escritura (acciones de la interfaz, ciclos, agenda) pasa por un único candado, así que dos ciclos no pueden intercalarse.
- **Contraseña de administración, opcional:** definí `ADMIN_PASSWORD` antes de publicar la app. Las páginas de administración y **todas las server actions** pasan a exigir HTTP Basic Auth; `/auditoria`, `/becario/*` y el JSON público siguen abiertos.

## Arquitectura

```
Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui)
│
├─ src/app/                 páginas (interfaz en español) + server actions + rutas de API
│   ├─ actions.ts           crear programa, becarios, depósitos, cobertura, correr ciclo…
│   └─ api/                 /health, /public/audit, /agent/registration, /agent/tick
├─ src/lib/agent/
│   ├─ cycle.ts             pre-chequeo, ciclo de pago, respaldo en USD₮, cobertura, alertas
│   ├─ executor.ts          transferencias y cambios en Textile (simulación vs. en vivo)
│   └─ scheduler.ts         agenda en el proceso (ciclos vencidos + preparación del día anterior)
├─ src/lib/textile/         cliente RFQ de Textile y análisis de liquidez
├─ src/lib/celo/            clientes viem (firmante con atribución), saldos, ERC-8004
├─ src/lib/store.ts         persistencia JSON en data/becapay.json (escrituras atómicas)
└─ scripts/                 check-setup, register-erc8004, simulate-cycle
```

- **En vivo, la cadena es la fuente de verdad:** la caja en vivo es el saldo de la billetera del agente leído en Celo. El archivo JSON guarda programas, becarios (los nombres quedan privados), la bitácora y las referencias a las transacciones.
- La agenda arranca con el servidor (`src/instrumentation.ts`) y revisa cada `SCHEDULER_INTERVAL_SECONDS`. En un hosting serverless, llamá a `POST /api/agent/tick` desde un cron (protegelo con `CRON_SECRET`).

## Correrlo

Requisitos: Node.js 20 o superior (probado con Node 24) y npm.

```bash
npm install
npm run dev            # http://localhost:4317
```

Después abrí el panel y hacé clic en **"Cargar demo"** y luego en **"Correr ciclo"**. O, desde la terminal:

```bash
npm test               # chequeos sin red: partir órdenes, tope de deslizamiento, cobertura, sufijo de atribución
npm run simulate       # carga la demo y corre un ciclo en simulación con cotizaciones reales de Textile
npm run check          # chequeo de configuración, solo lectura (nunca imprime secretos)
npm run register:8004  # imprime el registro ERC-8004 y lo simula (sin transacción)
```

### Pasar a modo en vivo (solo después de revisar una simulación)

1. `cp .env.example .env.local` y completá vos `AGENT_PRIVATE_KEY` y `ATTRIBUTION_TAG`.
2. Fondeá la billetera del agente `0xDf0c8840FCc58A7554Bda12ed8A657c74B078C9c` con un poco de CELO para el gas (o USD₮ y `GAS_CURRENCY=USDT`), más USD₮ / wFIAT para los pagos.
3. Poné `PUBLIC_APP_URL` en la URL pública de la app y después `npm run register:8004 -- --send` (con `DRY_RUN=false`).
4. Poné `DRY_RUN=false`, reiniciá, comprobá que `/identidad` esté todo en verde y corré el primer ciclo con el botón (pide confirmación).

### Variables de entorno

Ver [`.env.example`](.env.example) (comentado en español). Las principales son `DRY_RUN`, `AGENT_WALLET_ADDRESS`, `AGENT_PRIVATE_KEY`, `ATTRIBUTION_TAG`, `GAS_CURRENCY`, `MAX_USDT_PER_CYCLE`, `MAX_SLIPPAGE_BPS`, `PUBLIC_APP_URL`, `ADMIN_PASSWORD` y `CRON_SECRET`.

## Limitaciones actuales

- wMXN no tiene hoy creadores de mercado del lado de pago en Textile, así que los becarios en wMXN cobran en USD₮ con una alerta. wPEN y wCLP no tienen corredor y no se pueden elegir.
- La persistencia es un solo archivo JSON: sirve para una fundación que corre el agente en su máquina o en una VM chica; no está pensada para un hosting multiusuario. La demo pública en https://becapay.vercel.app no puede escribir ese archivo, así que guarda la demo en la memoria del servidor. **Cargar demo** y **Correr ciclo** funcionan ahí, y los datos se borran cuando esa instancia se apaga. No se firma nada.
- La auditoría pública muestra las billeteras de los becarios (de todos modos son públicas on-chain) pero nunca los nombres.
