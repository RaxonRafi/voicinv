import { ApiProperty } from '@nestjs/swagger';

export class WaitlistJoinedDto {
  @ApiProperty({
    example: true,
    description:
      'Always true on success. The response is the same for new and repeat signups so the ' +
      'endpoint cannot be used to check whether a contact is already registered.',
  })
  joined: true;
}
