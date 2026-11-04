namespace HandWorkApi.Models;

public class ErrorResponse
{
    public int Status { get; set; }

    public string Message { get; set; } = string.Empty;

    public string TraceId { get; set; } = string.Empty;
}