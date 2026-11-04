using HandWorkApi.Models;

namespace HandWorkApi.Middlewares;

public static class StatusCodeHandlingExtensions
{
    public static IApplicationBuilder UseStatusCodeHandling(
        this IApplicationBuilder app)
    {
        app.UseStatusCodePages(async context =>
        {
            var response = context.HttpContext.Response;

            string message = response.StatusCode switch
            {
                400 => "Bad request.",
                401 => "Authentication is required.",
                403 => "Access denied.",
                404 => "The requested resource was not found.",
                405 => "HTTP method is not allowed.",
                409 => "A conflict occurred.",
                415 => "Unsupported media type.",
                429 => "Too many requests.",
                _ => "An HTTP error occurred."
            };

            var error = new ErrorResponse
            {
                Status = response.StatusCode,
                Message = message,
                TraceId = context.HttpContext.TraceIdentifier
            };

            response.ContentType = "application/json";

            await response.WriteAsJsonAsync(error);
        });

        return app;
    }
}