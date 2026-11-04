using HandWorkApi.Models;

namespace HandWorkApi.Middlewares;

public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Unexpected error occurred at {Path}",
                context.Request.Path
            );

            if (context.Response.HasStarted)
                throw;

            context.Response.Clear();
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";

            var error = new ErrorResponse
            {
                Status = 500,
                Message = "An unexpected error occurred. Please try again later.",
                TraceId = context.TraceIdentifier
            };

            await context.Response.WriteAsJsonAsync(error);
        }
    }
}