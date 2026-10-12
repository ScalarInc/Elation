from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for every request/response schema.

    Python attributes stay snake_case (PEP 8); JSON uses camelCase. Input accepts
    either form; FastAPI serialises responses by alias, so output is camelCase.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
