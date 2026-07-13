using Microsoft.AspNetCore.Mvc;

namespace YourApp.Api.Controllers
{
    [ApiController]
    [Route("api/health")]
    public sealed class HealthController : ControllerBase
    {
        // GET /health
        [HttpGet]
        public IActionResult Get()
        {
            return Ok(new
            {
                status = "Healthy",
                service = "KB API",
                utc = DateTime.UtcNow
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