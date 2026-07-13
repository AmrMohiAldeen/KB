using Microsoft.AspNetCore.Mvc;

namespace Kb.Api.Controllers
{
    [ApiController]
    [Route("api/health")]
    public sealed class HealthController : ControllerBase
    {
        private readonly TimeProvider _timeProvider;

        public HealthController(TimeProvider timeProvider)
        {
            _timeProvider = timeProvider;
        }

        // GET /health
        [HttpGet]
        public IActionResult Get()
        {
            return Ok(new
            {
                status = "Healthy",
                service = "KB API",
                utc = _timeProvider.GetUtcNow()
            });
        }

        // GET /health/ping
        [HttpGet("ping")]
        public IActionResult Ping()
        {
            return Ok("pong");
        }
    }
}
