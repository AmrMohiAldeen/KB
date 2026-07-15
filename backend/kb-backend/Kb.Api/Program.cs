using Kb.Api;
using Kb.Application;
using Kb.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;


var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddApiServices(builder.Configuration);

// Development authentication: when SSO is configured remove and add SSO configuration 
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/openapi/v1.json", "Kb API V1");
    });
}

app.UseHttpsRedirection();

app.UseExceptionHandler();

app.UseCors(ApiCors.FrontendPolicy);

app.UseAuthentication();

app.UseAuthorization();

app.MapControllers();

app.Run();
