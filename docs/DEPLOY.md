# Deploy AGORA+

One process holds the office room and the waiting approvals in memory. Run one task. A second task has its own room and will not see the first task's approvals. Household files live under `.agora-data` (or `AGORA_DATA_DIR`) on that task's disk. Replacing the task deletes them unless that directory is on a volume that survives the replacement.

The production process is `server/prod.ts`, bundled to `dist/server.mjs`. It listens on `PORT` (8080 when unset). It binds `0.0.0.0` only when `AGORA_HOUSEHOLD_PASSCODE` is set. Otherwise it binds `127.0.0.1` and the log says why. It serves `dist/` and attaches the same relay and MCP routes as the dev server. Do not put secrets in the image.

`npm run dev` binds `127.0.0.1`. `npm run dev:lan` binds `0.0.0.0`. On any bind that is not loopback, OAuth and `/mcp` return 503 until `AGORA_PUBLIC_URL` is set. With no passcode, every `/api/*` household route returns 403 unless the socket address is loopback. Loopback with no passcode still serves the household.

Build locally:

```bash
npm run build
./node_modules/.bin/esbuild server/prod.ts --bundle --platform=node --format=esm --outfile=dist/server.mjs --packages=external
PORT=8080 node dist/server.mjs
```

`npm run preview` serves the client only. It does not start the room.

## Named Cloudflare tunnel

A quick tunnel (`cloudflared tunnel --url http://127.0.0.1:8080`) prints a new `trycloudflare.com` hostname every run. Alexa+ stores the MCP URL from deploy. That hostname must stay put. Use a named tunnel and a hostname you control.

These commands match [Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/) (updated Aug 25, 2026). The site has to be on Cloudflare first, with the domain's nameservers pointed at Cloudflare.

Install on Fedora or RHEL:

```bash
curl -fsSl https://pkg.cloudflare.com/cloudflared.repo | sudo tee /etc/yum.repos.d/cloudflared.repo
sudo yum update && sudo yum install cloudflared
```

Create the tunnel. `<NAME>` is a stable name, for example `agora-plus`. `<hostname>` is the public name, for example `agora.example.com`.

```bash
cloudflared tunnel login
cloudflared tunnel create agora-plus
cloudflared tunnel list
```

`tunnel create` prints a UUID and writes `~/.cloudflared/<UUID>.json`. Put this in `~/.cloudflared/config.yml`, with the UUID from that output. The single `url` field is the current published-application example. It sends every request for the routed hostname to this process.

```yaml
url: http://127.0.0.1:8080
tunnel: <UUID>
credentials-file: /home/<you>/.cloudflared/<UUID>.json
```

```bash
cloudflared tunnel route dns agora-plus agora.example.com
cloudflared tunnel run agora-plus
```

If the config file is not in the default directory:

```bash
cloudflared tunnel --config /path/config.yml run agora-plus
```

Set the server's public origin to that hostname, with no path and no trailing slash:

```bash
AGORA_PUBLIC_URL=https://agora.example.com
```

The add-on MCP URL is `https://agora.example.com/mcp`. Privacy and terms are `https://agora.example.com/privacy.html` and `https://agora.example.com/terms.html`.

## AWS

Check Express Mode before relying on it. The [overview](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html) says it is available in every region where ECS and Fargate are supported. Confirm this account's CLI actually has the command:

```bash
aws ecs create-express-gateway-service help
```

If that command is missing, use the one-task Fargate service below.

### Image in Amazon ECR

[Create a repository](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-create.html) and [push](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html). Replace the account id and region.

```bash
aws ecr create-repository --repository-name agora-plus --region "$AWS_REGION"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com"
docker build -t agora-plus .
docker tag agora-plus:latest "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/agora-plus:latest"
docker push "$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/agora-plus:latest"
```

The [Dockerfile](../Dockerfile) builds the client, bundles `server/prod.ts` to `dist/server.mjs`, and runs `node dist/server.mjs`. The container listens on 8080.

### ECS Express Mode

Express Mode builds a Fargate service, an HTTPS URL, and an Application Load Balancer. The commands below follow [Create your first Express Mode service using the AWS CLI](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-getting-started.html).

Create the execution role and the infrastructure role with the trust policies and managed policies on that page (`AmazonECSTaskExecutionRolePolicy` and `AmazonECSInfrastructureRoleforExpressGatewayServices`). A new role can take about a minute before `create-express-gateway-service` can assume it.

Create a task role for Bedrock and Polly (policy below) and attach it with `--task-role-arn`.

verify: `--task-role-arn` is named on the [create-express-gateway-service](https://docs.aws.amazon.com/cli/latest/reference/ecs/create-express-gateway-service.html) page as a parameter that cannot be combined with `--task-definition-arn`. The getting-started example does not pass it. Confirm the flag in `aws ecs create-express-gateway-service help` before running.

```bash
aws ecs create-express-gateway-service \
  --service-name agora-plus \
  --execution-role-arn "arn:aws:iam::$ACCOUNT:role/ecsTaskExecutionRole" \
  --infrastructure-role-arn "arn:aws:iam::$ACCOUNT:role/ecsInfrastructureRoleForExpressServices" \
  --task-role-arn "arn:aws:iam::$ACCOUNT:role/agoraPlusTask" \
  --primary-container "{\"image\":\"$ACCOUNT.dkr.ecr.$AWS_REGION.amazonaws.com/agora-plus:latest\",\"containerPort\":8080}" \
  --scaling-target '{"minTaskCount":1,"maxTaskCount":1}' \
  --health-check-path "/" \
  --monitor-resources
```

`--scaling-target` uses the same JSON shape as the getting-started example (`minTaskCount` / `maxTaskCount`). Both are 1 so a second task is not started. `--cpu` and `--memory` are omitted. That page's minimum example is 1 vCPU and 2 GB. There is no `/health` route. `/` serves the app HTML and returns 200.

verify: `--health-check-path "/"` is the flag from that page. Confirm Express Mode treats a static `index.html` response as healthy.

The service URL looks like `https://agora-plus.ecs.<region>.on.aws/`. Set `AGORA_PUBLIC_URL` to that origin. Pass it in the primary container `environment` list when you create or update the service. The [update command](https://docs.aws.amazon.com/cli/latest/reference/ecs/update-express-gateway-service.html) takes `--primary-container` as well.

Secrets go in the primary container `secrets` array, `valueFrom` set to a Secrets Manager ARN or an SSM parameter ARN. The execution role, not the task role, reads them at start. `AmazonECSTaskExecutionRolePolicy` does not include `secretsmanager:GetSecretValue`. Add that on the secret's ARN. Shape and the extra permission: [Specifying sensitive data](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html).

verify: the getting-started JSON shows `secrets: [{ "name", "valueFrom" }]`. Confirm a Secrets Manager ARN is accepted in Express Mode, not only in a hand-written task definition.

### Load balancer idle timeout

WebSockets and the voice simulator's server-sent events stay open. The Application Load Balancer idle timeout must be at least 300 seconds. The default is 60. Express Mode's create command does not document this attribute. After the load balancer exists:

```bash
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn "$ALB_ARN" \
  --attributes Key=idle_timeout.timeout_seconds,Value=300
```

The attribute name is from [Connection idle timeout](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#connection-idle-timeout).

verify: which load balancer Express Mode created, and that a later Express Mode update does not reset the attribute. Find it from the service description or the EC2 console.

### One-task Fargate, if Express Mode is not available

Use one Fargate service, desired count 1, behind an Application Load Balancer, container port 8080, same task role and execution role as above. Set the load balancer idle timeout to 300 seconds with the `elbv2` command above. The target group health check can use `/`.

```bash
aws ecs create-service \
  --cluster agora \
  --service-name agora-plus \
  --task-definition agora-plus \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-ccc],assignPublicIp=ENABLED}" \
  --load-balancers "targetGroupArn=$TG_ARN,containerName=agora,containerPort=8080"
```

verify: subnet ids, security group, `assignPublicIp`, the cluster, and the container name in the task definition. This sketch matches [create-service](https://docs.aws.amazon.com/cli/latest/reference/ecs/create-service.html) but was not run in this workspace. The task definition itself (CPU, memory, `awsvpc`, port mapping 8080, log driver, secrets, task role) is [Task definition parameters](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html).

### Task role

Trust `ecs-tasks.amazonaws.com` with `sts:AssumeRole`. Permissions for this app:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockMantle",
      "Effect": "Allow",
      "Action": "bedrock-mantle:CreateInference",
      "Resource": "arn:aws:bedrock-mantle:*:*:project/*"
    },
    {
      "Sid": "PollySpeech",
      "Effect": "Allow",
      "Action": "polly:SynthesizeSpeech",
      "Resource": "*"
    }
  ]
}
```

`bedrock-mantle:CreateInference` is the Mantle inference action. The resource shape matches the managed policy `AmazonBedrockMantleInferenceAccess`. Polly `SynthesizeSpeech` is granted on `*`. The app calls Polly with the default credential chain in `AWS_REGION`.

### Disk

`.agora-data` is inside the container filesystem. A new task starts empty. Mount an EFS volume if the household files must survive a replacement, and set `AGORA_DATA_DIR` to that mount when it is not the default path. Express Mode's primary-container example does not show a volume. A custom task definition can. The Express Mode container in that path has to be named `Main`. See [Amazon EFS volumes](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/efs-volumes.html).

verify: whether the Express Mode service you created will accept an EFS volume without leaving Express Mode. If it will not, the household files are ephemeral and that should be an explicit choice.

## Cloud Run

`server/prod.ts` is the Cloud Run process. One instance holds the room in memory. When every browser disconnects, Cloud Run may shut the process down, and the room is gone. A model call still in flight is not a background job and is not saved. Keep a single instance so approvals stay on the process that created them.

The container already listens on `PORT`. Cloud Run sets `PORT`. The Dockerfile exposes 8080.

```bash
gcloud run deploy agora-plus \
  --source . \
  --region "$REGION" \
  --port 8080 \
  --min-instances 1 \
  --max-instances 1 \
  --timeout 3600 \
  --session-affinity \
  --no-cpu-throttling
```

verify: `--source` uses the Dockerfile when one is present ([Deploy from source](https://cloud.google.com/run/docs/deploying-source-code)). `--session-affinity` is [Session affinity](https://cloud.google.com/run/docs/configuring/session-affinity). `--no-cpu-throttling` keeps CPU allocated when the instance is idle, which is [CPU allocation](https://cloud.google.com/run/docs/configuring/cpu-allocation). Confirm the flag names in `gcloud run deploy --help` for the installed gcloud. Pass `AGORA_*` with `--set-secrets` or `--update-env-vars`, not in the image. Cloud Run's disk is ephemeral too, unless you add a volume. This command was not run from this workspace.

Set `AGORA_PUBLIC_URL` to the Cloud Run origin.

## Environment

Every name in `.env.example`. Empty in that file means unset. Do not commit real values.

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | optional | none | Key for the TypeSafe decider. `JEV_API_KEY` is an accepted alias. Server only. |
| `AGORA_DECIDER` | optional | `legacy` | `legacy` keeps the previous checks. `jev` uses the three System One gates. Any other value is treated as `legacy`. |
| `TYPESAFE_BASE_URL` | optional | `https://api.typesafe.ai` | Decider base URL. |
| `JEV_MODEL` | optional | `jev-1.13.0` | Decider model id. |
| `DASHSCOPE_API_KEY` | optional | none | Server key for the Qwen Cloud writing model. Token Plan keys (`sk-sp-…`) use the Token Plan host. |
| `AGORA_TIMEZONE` | optional | the server zone | IANA zone for "due today", "at 6pm", and "in 10 minutes". Times are stored as ISO 8601 with a numeric offset. The server reads this name. `.env.example` does not list it yet. |
| `EXA_API_KEY` | optional | none | Web search for tasks the decider marks as needing current information, and a fallback for `web_research`. Server only. |
| `AGORA_PUBLIC_URL` | required off loopback | request origin on loopback | Public HTTPS origin, no path. OAuth resource identifier and discovery issuer when set. OAuth and `/mcp` return 503 when this is unset and the process is not bound to loopback. |
| `AGORA_TRUST_PROXY` | optional | unset | Set to `1` before `X-Forwarded-Proto` sets the Secure cookie or the OAuth issuer. Otherwise that header is ignored. |
| `AGORA_OAUTH_REDIRECT_URIS` | required for a public Alexa redirect | none | Comma-separated exact `redirect_uri` values. Anything else is rejected. The simulator's own `http://127.0.0.1`, `http://localhost`, and `::1` callbacks are always allowed. |
| `AGORA_DATA_DIR` | optional | `.agora-data` | Directory for memory, tasks, approvals, and saved runs. |
| `AGORA_OAUTH_CLIENT_ID` | optional | none | OAuth client id. OAuth stays off until this, the secret, and `AGORA_TOKEN_SECRET` are all set. |
| `AGORA_OAUTH_CLIENT_SECRET` | optional | none | OAuth client secret. Server only. |
| `AGORA_TOKEN_SECRET` | optional | none | HMAC secret for access and refresh tokens. Server only. OAuth stays off when it is shorter than 32 characters. |
| `AGORA_HOUSEHOLD_PASSCODE` | required to bind `0.0.0.0` | none | When set, household HTTP routes return `household_locked` until the passcode cookie is set, and production listens on `0.0.0.0`. When unset, production listens on `127.0.0.1` and household routes answer only on loopback. Five wrong guesses lock that address for 15 minutes (HTTP 429), shared with the OAuth consent page. |
| `AGORA_MCP_TOKEN` | optional | none | Development bearer for the MCP Inspector and Claude Code. At least 32 characters. A shorter value is ignored. Ignored when `NODE_ENV=production` or `AGORA_PUBLIC_URL` is https, unless `AGORA_ALLOW_DEV_TOKEN=1`. It does not expire. |
| `AGORA_ALLOW_DEV_TOKEN` | optional | unset | Set to `1` to keep `AGORA_MCP_TOKEN` in production or behind an https public URL. |
| `AGORA_SERVER_LLM` | optional | none | Set to `bedrock` to call Amazon Bedrock when the browser sent no key. |
| `AWS_REGION` | optional | `us-east-1` for Bedrock | Region for Bedrock and Polly. |
| `BEDROCK_MODEL` | optional | `anthropic.claude-sonnet-5` | Bedrock Messages model. |
| `BEDROCK_FAST_MODEL` | optional | `anthropic.claude-haiku-4-5` | Faster model for short turns. |
| `ALEXA_SIM_MODEL` | optional | `BEDROCK_FAST_MODEL` | Voice simulator model. |
| `ALEXA_SIM_FAST_PATH` | optional | on | Set to `0` to send every simulator turn through the model. Unset uses the fast path for simple commands. |
| `AGORA_SELF_URL` | optional | `http://127.0.0.1:<port>` | Base URL the voice simulator uses when it calls this server. |
| `POLLY_VOICE` | optional | `Joanna` | Amazon Polly voice id. |
| `POLLY_ENGINE` | optional | `neural` | Amazon Polly engine. |
| `FIRECRAWL_API_KEY` | optional | none | Web research. Falls back to Exa when unset. Server only. |

`PORT` is commented in `.env.example`. `server/prod.ts` uses it and defaults to 8080. Also in that file, and forwarded into the dev server: `DEMO_HOST_SECRET`, `SOCIETY_REPLAY`, `BENCH_REPLAY`, and `DISABLE_HMR`. `QWEN_BASE_URL` and `QWEN_MODEL` are not in `.env.example`. The server does not read them.

On an open bind with no `DEMO_HOST_SECRET`, the office host seat is the household session, not the first caller. With a passcode set, `/api/cors-proxy`, `/api/model-test`, and the `/__relay` upgrade require the `agora_household` cookie. Refresh records persist in `oauth-refreshes.json` under `AGORA_DATA_DIR`. The simulator link persists in `oauth-sim-account.json`. Waiting approvals and authorization codes are still only in memory.
