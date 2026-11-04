using Microsoft.AspNetCore.Authentication.JwtBearer;
using HandWorkApi.Models;

namespace HandWorkApi.Extensions;

public static class JwtErrorHandlingExtensions
{
    public static void ConfigureJwtErrorHandling(
        this JwtBearerOptions options)
    {
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async context =>
            {
                context.HandleResponse();

                context.Response.StatusCode = 401;
                context.Response.ContentType = "application/json";

                var error = new ErrorResponse
                {
                    Status = 401,
                    Message = "Authentication is required or the token is invalid.",
                    TraceId = context.HttpContext.TraceIdentifier
                };

                await context.Response.WriteAsJsonAsync(error);
            },

            OnForbidden = async context =>
            {
                context.Response.StatusCode = 403;
                context.Response.ContentType = "application/json";

                var error = new ErrorResponse
                {
                    Status = 403,
                    Message = "You do not have permission to access this resource.",
                    TraceId = context.HttpContext.TraceIdentifier
                };

                await context.Response.WriteAsJsonAsync(error);
            }
        };
    }
}